// supabase/functions/gmail-oauth-disconnect/index.ts
//
// Called when the person clicks "Disconnect" in Settings. Tells Google to
// revoke the refresh token (so it can't be used by anyone, ever again,
// even if it somehow leaked) and deletes the stored row.

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: row } = await adminClient
      .from("gmail_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (row?.refresh_token) {
      // Best-effort revoke with Google — if this call fails (e.g. network
      // hiccup, or Google already considers it invalid), we still proceed
      // to delete our own stored row regardless, since that's what
      // actually controls whether this app can send as the person.
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
      } catch {
        // ignored — deleting our row below is what actually matters
      }
    }

    await adminClient.from("gmail_tokens").delete().eq("user_id", userId);

    return json({ disconnected: true });
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
