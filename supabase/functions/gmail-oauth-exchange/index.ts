// supabase/functions/gmail-oauth-exchange/index.ts
//
// Receives the one-time authorization `code` from the frontend (obtained
// via Google's authorization-code popup flow), exchanges it with Google
// for an access token + refresh token, stores the refresh token (the
// long-lived secret) in the gmail_tokens table using the service role key,
// and returns ONLY the short-lived access token + email back to the
// browser. The refresh token itself never reaches the frontend.

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

    // Verify the calling user's own session token (the app's normal login),
    // NOT a Google token — this confirms a real logged-in business owner
    // is making this request, before we do anything with Google.
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const userId = userData.user.id;

    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return json({ error: "Missing code or redirectUri" }, 400);
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    // Exchange the authorization code for tokens. This is the one call
    // that can return a refresh_token — and Google only includes it on
    // the very first consent for this app+account (or any consent where
    // prompt=consent forced re-approval), which is why the frontend
    // always requests prompt=consent.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return json(
        { error: tokenData.error_description || tokenData.error || "Token exchange failed" },
        400
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    if (!refresh_token) {
      // Google didn't issue one — almost always means the account already
      // had an active grant and Google skipped re-issuing it. The frontend
      // handles this by telling the person to fully revoke access at
      // myaccount.google.com/permissions and try again.
      return json(
        {
          error:
            "Google did not return a refresh token. Please revoke this app's access at " +
            "myaccount.google.com/permissions, then try connecting again.",
        },
        400
      );
    }

    // Look up the connected email using the access token we just got.
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.email || "Gmail account";

    // Store the refresh token server-side using the service role key,
    // which bypasses RLS — this is the only path that's allowed to write
    // to this table at all (see migration comments).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await adminClient
      .from("gmail_tokens")
      .upsert(
        { user_id: userId, email, refresh_token, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return json({ error: "Could not save connection: " + upsertError.message }, 500);
    }

    return json({ access_token, email, expires_in: expires_in || 3600 });
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
