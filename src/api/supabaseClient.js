import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local (and in Vercel Project Settings for production)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
