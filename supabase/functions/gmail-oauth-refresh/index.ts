// supabase/functions/gmail-oauth-refresh/index.ts
//
// Called by the frontend whenever its access token has expired (or on
// page load if none is cached). Looks up the stored refresh token for the
// logged-in user and exchanges it with Google for a brand new access
// token — no popup, no consent screen, completely silent. This is what
// lets the Gmail connection survive an hour passing, a tab closing, or
// the browser restarting.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const userId = userData.user.id;

    // Service role client to read the stored refresh token — this is the
    // only place in the app that ever reads refresh_token's actual value.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: row, error: fetchError } = await adminClient
      .from("gmail_tokens")
      .select("email, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      return json({ error: fetchError.message }, 500);
    }
    if (!row) {
      // Not connected yet — this is a normal, expected state, not an
      // error condition, so the frontend can just show "Connect Gmail".
      return json({ connected: false });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      // A refresh token can stop working (password change, explicit
      // revoke at myaccount.google.com, or 6 months of inactivity per
      // Google's testing-mode limits) — when that happens, clear our
      // stored row so the app correctly falls back to "Connect Gmail"
      // instead of silently failing on every send attempt.
      await adminClient.from("gmail_tokens").delete().eq("user_id", userId);
      return json(
        {
          connected: false,
          error:
            tokenData.error_description ||
            "Gmail connection expired or was revoked — please connect again.",
        },
        200
      );
    }

    return json({
      connected: true,
      access_token: tokenData.access_token,
      email: row.email,
      expires_in: tokenData.expires_in || 3600,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
