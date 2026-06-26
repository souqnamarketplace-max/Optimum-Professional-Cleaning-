import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local (and in Vercel Project Settings for production)."
  );
}

// persistSession + autoRefreshToken are Supabase's defaults, but set
// explicitly here so "stay logged in" is documented intent rather than an
// implicit default someone could accidentally change later. This is what
// makes logging in once keep you logged in — closing the browser, the next
// day, etc — until Log out is clicked. Session lives in localStorage
// (survives browser restarts), unlike the Gmail connection's token which
// is deliberately kept in sessionStorage for tighter security.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});
