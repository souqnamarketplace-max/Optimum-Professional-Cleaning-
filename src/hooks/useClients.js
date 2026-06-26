import { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabaseClient";

export function useClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("name", { ascending: true });
    if (!error) setClients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const addClient = async (client) => {
    const { data, error } = await supabase
      .from("clients")
      .insert([client])
      .select()
      .single();
    if (error) throw error;
    setClients((prev) =>
      [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
    );
    return data;
  };

  const updateClient = async (id, updates) => {
    const { data, error } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  };

  const deleteClient = async (id) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  return { clients, loading, addClient, updateClient, deleteClient, refetch: fetchClients };
}
