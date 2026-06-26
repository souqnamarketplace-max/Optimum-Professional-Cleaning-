import React, { useState, useEffect } from "react";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { supabase } from "../../api/supabaseClient";

// Defined OUTSIDE SettingsTab so it keeps a stable identity across re-renders.
// If this lived inside SettingsTab, every keystroke would redefine it as a
// "new" component, forcing React to remount the <input> and drop focus —
// that's what caused the "click after every character" bug.
function Field({ label, field, type = "text", placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg px-4 py-3 text-white outline-none"
        style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.08)" }}
      />
    </div>
  );
}

export default function SettingsTab() {
  const { settings, loading, updateSettings } = useSiteSettings();
  const [form, setForm] = useState({
    companyName: "",
    email: "",
    website: "",
    address: "",
    phone: "",
    logoUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.company_name || "",
        email: settings.email || "",
        website: settings.website || "",
        address: settings.address || "",
        phone: settings.phone || "",
        logoUrl: settings.logo_url || "",
      });
    }
  }, [settings]);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("assets").getPublicUrl(fileName);
      setForm((f) => ({ ...f, logoUrl: data.publicUrl }));
    } catch (err) {
      setMessage("Logo upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateSettings({
        company_name: form.companyName,
        email: form.email,
        website: form.website,
        address: form.address,
        phone: form.phone,
        logo_url: form.logoUrl,
      });
      setMessage("Settings saved.");
    } catch (err) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-slate-400">Loading settings...</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-xl font-bold text-white mb-2">Company Settings</h2>
      <p className="text-slate-400 text-sm mb-6">
        This information appears on every quote, invoice, and receipt you generate.
      </p>

      <Field label="Company Name" field="companyName" placeholder="Acme Inc." value={form.companyName} onChange={handleChange("companyName")} />
      <Field label="Email" field="email" type="email" placeholder="hello@acme.com" value={form.email} onChange={handleChange("email")} />
      <Field label="Website" field="website" placeholder="https://acme.com" value={form.website} onChange={handleChange("website")} />
      <Field label="Address" field="address" placeholder="123 Main St, City, Province" value={form.address} onChange={handleChange("address")} />
      <Field label="Phone (optional)" field="phone" placeholder="" value={form.phone} onChange={handleChange("phone")} />

      <div>
        <label className="block text-sm text-slate-300 mb-1">Logo</label>
        <div className="flex items-center gap-4">
          {form.logoUrl && (
            <img
              src={form.logoUrl}
              alt="Logo preview"
              className="h-12 rounded"
              style={{ background: "#fff", padding: 4 }}
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            disabled={uploading}
            className="text-sm text-slate-400"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {message && <p className="text-sm text-slate-400 mt-2">{message}</p>}
    </div>
  );
}
