import React, { useState, useEffect } from "react";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useGmailSend } from "../../hooks/useGmailSend";
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

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-lg px-4 py-3 text-white outline-none"
        style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Common Canadian sales tax presets — picking one fills in both the label
// and the rate. "Custom" leaves both fields free for manual entry (e.g. for
// a tax-exempt client, or a province/situation not listed here).
const TAX_PRESETS = [
  { value: "custom", label: "Custom (enter manually)", taxLabel: "", taxRate: "" },
  { value: "gst", label: "GST only — 5% (AB, most territories)", taxLabel: "GST", taxRate: 5 },
  { value: "hst-on", label: "HST — 13% (Ontario)", taxLabel: "HST", taxRate: 13 },
  { value: "hst-maritimes", label: "HST — 15% (NS, NB, NL, PE)", taxLabel: "HST", taxRate: 15 },
  { value: "gst-pst-bc", label: "GST + PST — 5% + 7% (BC)", taxLabel: "GST+PST", taxRate: 12 },
  { value: "gst-pst-sk", label: "GST + PST — 5% + 6% (Saskatchewan)", taxLabel: "GST+PST", taxRate: 11 },
  { value: "gst-pst-mb", label: "GST + PST — 5% + 7% (Manitoba)", taxLabel: "GST+PST", taxRate: 12 },
  { value: "gst-qst", label: "GST + QST — 5% + 9.975% (Quebec)", taxLabel: "GST+QST", taxRate: 14.975 },
  { value: "none", label: "No tax charged", taxLabel: "", taxRate: 0 },
];

const CURRENCIES = [
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
];

export default function SettingsTab() {
  const { settings, loading, updateSettings } = useSiteSettings();
  const gmail = useGmailSend();
  const [form, setForm] = useState({
    companyName: "",
    email: "",
    website: "",
    address: "",
    phone: "",
    logoUrl: "",
    defaultCurrency: "CAD",
    defaultTaxLabel: "GST",
    defaultTaxRate: 5,
    etransferEmail: "",
    bankInstitution: "",
    bankTransit: "",
    bankAccount: "",
  });
  const [taxPreset, setTaxPreset] = useState("gst");
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
        defaultCurrency: settings.default_currency || "CAD",
        defaultTaxLabel: settings.default_tax_label ?? "GST",
        defaultTaxRate: settings.default_tax_rate ?? 5,
        etransferEmail: settings.etransfer_email || "",
        bankInstitution: settings.bank_institution || "",
        bankTransit: settings.bank_transit || "",
        bankAccount: settings.bank_account || "",
      });
      // Try to match a known preset so the dropdown reflects saved values;
      // falls back to "custom" if it doesn't match any preset exactly.
      const match = TAX_PRESETS.find(
        (p) =>
          p.taxLabel === (settings.default_tax_label ?? "GST") &&
          Number(p.taxRate) === Number(settings.default_tax_rate ?? 5)
      );
      setTaxPreset(match ? match.value : "custom");
    }
  }, [settings]);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleTaxPresetChange = (e) => {
    const presetValue = e.target.value;
    setTaxPreset(presetValue);
    const preset = TAX_PRESETS.find((p) => p.value === presetValue);
    if (preset && presetValue !== "custom") {
      setForm((f) => ({
        ...f,
        defaultTaxLabel: preset.taxLabel,
        defaultTaxRate: preset.taxRate,
      }));
    }
  };

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
        default_currency: form.defaultCurrency,
        default_tax_label: form.defaultTaxLabel,
        default_tax_rate: form.defaultTaxRate === "" ? 0 : Number(form.defaultTaxRate),
        etransfer_email: form.etransferEmail,
        bank_institution: form.bankInstitution,
        bank_transit: form.bankTransit,
        bank_account: form.bankAccount,
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

      <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Billing defaults</h3>
        <p className="text-slate-500 text-xs mb-4">
          Used to pre-fill every new Quote, Invoice, and Receipt — you can still
          override these per document. If Tax Rate is 0, no tax line is shown
          on the document at all.
        </p>
      </div>

      <Select
        label="Default Currency"
        value={form.defaultCurrency}
        onChange={handleChange("defaultCurrency")}
        options={CURRENCIES}
      />

      <Select
        label="Tax Preset"
        value={taxPreset}
        onChange={handleTaxPresetChange}
        options={TAX_PRESETS}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Tax Label"
          field="defaultTaxLabel"
          placeholder="GST"
          value={form.defaultTaxLabel}
          onChange={(e) => {
            setTaxPreset("custom");
            handleChange("defaultTaxLabel")(e);
          }}
        />
        <Field
          label="Tax Rate %"
          field="defaultTaxRate"
          type="number"
          placeholder="5"
          value={form.defaultTaxRate}
          onChange={(e) => {
            setTaxPreset("custom");
            handleChange("defaultTaxRate")(e);
          }}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-300 mb-1">Logo</label>
        <div className="flex items-center gap-4 flex-wrap">
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

      <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Payment information</h3>
        <p className="text-slate-500 text-xs mb-4">
          Shown on every quote, invoice, and receipt so clients know how to pay you.
          Fill in whichever method(s) you use — anything left blank simply won't
          appear on the document.
        </p>

        <div className="space-y-4">
          <Field
            label="e-Transfer email or phone"
            field="etransferEmail"
            placeholder="you@email.com or 780-555-0123"
            value={form.etransferEmail}
            onChange={handleChange("etransferEmail")}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              label="Institution number"
              field="bankInstitution"
              placeholder="001"
              value={form.bankInstitution}
              onChange={handleChange("bankInstitution")}
            />
            <Field
              label="Transit number"
              field="bankTransit"
              placeholder="12345"
              value={form.bankTransit}
              onChange={handleChange("bankTransit")}
            />
            <Field
              label="Account number"
              field="bankAccount"
              placeholder="1234567"
              value={form.bankAccount}
              onChange={handleChange("bankAccount")}
            />
          </div>
        </div>
      </div>

      <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Sending emails</h3>
        <p className="text-slate-500 text-xs mb-4">
          Connect your Gmail so quotes, invoices, and receipts send automatically
          as you — with the PDF attached and your signature below included.
        </p>

        <div
          className="rounded-lg p-4 flex items-center justify-between flex-wrap gap-3"
          style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {gmail.checking ? (
            <p className="text-sm text-slate-400">Checking connection...</p>
          ) : gmail.isConnected ? (
            <>
              <div>
                <p className="text-sm text-white font-medium">Connected</p>
                <p className="text-xs text-slate-400">{gmail.connectedEmail}</p>
              </div>
              <button
                onClick={gmail.disconnect}
                className="text-sm px-3 py-1.5 rounded-lg text-slate-300"
                style={{ background: "#131d35" }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">Not connected</p>
              <button
                onClick={gmail.connect}
                disabled={gmail.connecting}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
              >
                {gmail.connecting ? "Connecting..." : "Connect Gmail"}
              </button>
            </>
          )}
        </div>
        {gmail.error && (
          <p className="text-xs mt-2" style={{ color: "#f5365c" }}>
            {gmail.error}
          </p>
        )}
        {!gmail.isConnected && !gmail.checking && (
          <p className="text-xs text-slate-500 mt-2">
            This connection stays active once made — no need to reconnect every
            hour or after closing the browser. You'll only be asked to connect
            again if you click Disconnect, or if Google access is revoked.
          </p>
        )}
      </div>

      <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Email signature</h3>
        <p className="text-slate-500 text-xs mb-3">
          Automatically built from the company info above — shown at the
          bottom of every quote, invoice, and receipt email.
        </p>
        <div
          className="rounded-lg p-4 text-sm text-slate-300 whitespace-pre-line"
          style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[form.companyName, form.phone, form.email, form.website].filter(Boolean).join("\n") ||
            "Fill in company info above to preview your signature."}
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
