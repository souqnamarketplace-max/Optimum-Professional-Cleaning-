import { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabaseClient";

export function useSiteSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error);
    } else {
      setSettings(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates) => {
    if (!settings?.id) {
      const { data, error } = await supabase
        .from("site_settings")
        .insert([updates])
        .select()
        .single();
      if (error) throw error;
      setSettings(data);
      return data;
    }

    const { data, error } = await supabase
      .from("site_settings")
      .update(updates)
      .eq("id", settings.id)
      .select()
      .single();
    if (error) throw error;
    setSettings(data);
    return data;
  };

  return { settings, loading, error, updateSettings, refetch: fetchSettings };
}
