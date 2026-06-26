import React, { useState, useEffect } from "react";
import { supabase } from "../../api/supabaseClient";
import { calcDocumentTotals, fmtMoney } from "../../lib/pdfGenerator";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useClients } from "../../hooks/useClients";
import Toast from "./Toast";

const emptyItem = () => ({
  id: crypto.randomUUID(),
  name: "",
  detail: "",
  qty: 1,
  unitPrice: 0,
  discount: 0,
});

const emptySystem = () => ({
  id: crypto.randomUUID(),
  name: "New System",
  items: [emptyItem()],
});

const PREFIX = { quote: "Q", invoice: "INV", receipt: "REC" };

function blankDoc(defaults = {}) {
  return {
    doc_type: "quote",
    doc_number: "", // assigned automatically when first saved
    doc_title: "Quote",
    client_name: "",
    client_email: "",
    client_address: "",
    client_phone: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    valid_until: "",
    items: [emptyItem()],
    systems: [],
    use_systems: false,
    show_unit_prices: true,
    tax_label: defaults.taxLabel ?? "GST",
    tax_rate: defaults.taxRate ?? 0,
    currency: defaults.currency || "CAD",
    notes: "",
    terms: "",
    status: "pending",
  };
}

const inputStyle = {
  background: "#0f1729",
  border: "1px solid rgba(255,255,255,0.08)",
};

// Defined OUTSIDE DocumentEditor so it keeps a stable component identity
// across re-renders. Previously this was defined inside DocumentEditor,
// which meant every keystroke (every setDoc call) redefined ItemRow as a
// "new" component type — React would then unmount/remount the <input>
// elements on each render, dropping keyboard focus after every character.
function ItemRow({ item, showUnitPrices, onChange, onRemove }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start mb-2 p-3 sm:p-0 rounded-lg sm:rounded-none"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <input
        className="col-span-2 sm:col-span-4 rounded-lg px-3 py-2 text-white text-sm outline-none"
        style={inputStyle}
        placeholder="Item name"
        value={item.name}
        onChange={(e) => onChange("name", e.target.value)}
      />
      <input
        className="col-span-2 sm:col-span-3 rounded-lg px-3 py-2 text-white text-sm outline-none"
        style={inputStyle}
        placeholder="Detail (optional)"
        value={item.detail}
        onChange={(e) => onChange("detail", e.target.value)}
      />
      <div className="col-span-1 sm:col-span-1">
        <span className="block sm:hidden text-[11px] text-slate-500 mb-1">Qty</span>
        <input
          type="number"
          inputMode="decimal"
          className="w-full rounded-lg px-2 py-2 text-white text-sm outline-none"
          style={inputStyle}
          value={item.qty}
          onChange={(e) => onChange("qty", Number(e.target.value))}
        />
      </div>
      {showUnitPrices && (
        <>
          <div className="col-span-1 sm:col-span-2">
            <span className="block sm:hidden text-[11px] text-slate-500 mb-1">Unit Price</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-full rounded-lg px-2 py-2 text-white text-sm outline-none"
              style={inputStyle}
              value={item.unitPrice}
              onChange={(e) => onChange("unitPrice", Number(e.target.value))}
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <span className="block sm:hidden text-[11px] text-slate-500 mb-1">Disc %</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-full rounded-lg px-2 py-2 text-white text-sm outline-none"
              style={inputStyle}
              value={item.discount}
              onChange={(e) => onChange("discount", Number(e.target.value))}
              title="Discount %"
            />
          </div>
        </>
      )}
      <button
        onClick={onRemove}
        className="col-span-2 sm:col-span-1 text-sm rounded-lg py-2 text-center sm:text-left"
        style={{ color: "#f5365c", background: "rgba(245,54,92,0.08)" }}
      >
        Remove item
      </button>
    </div>
  );
}

// Column labels matching the ItemRow grid below — desktop only, since the
// mobile card layout already labels each field inline.
function ItemRowHeader({ showUnitPrices }) {
  return (
    <div className="hidden sm:grid grid-cols-12 gap-2 mb-1 px-1">
      <span className="col-span-4 text-xs text-slate-500">Item name</span>
      <span className="col-span-3 text-xs text-slate-500">Detail (optional)</span>
      <span className="col-span-1 text-xs text-slate-500">Qty</span>
      {showUnitPrices && (
        <>
          <span className="col-span-2 text-xs text-slate-500">Unit Price</span>
          <span className="col-span-1 text-xs text-slate-500">Disc %</span>
        </>
      )}
    </div>
  );
}

export default function DocumentEditor({ initialDoc, onSaved, onCancel }) {
  const { settings } = useSiteSettings();
  const { clients, addClient } = useClients();

  const [doc, setDoc] = useState(() => {
    if (!initialDoc) {
      return blankDoc({
        currency: settings?.default_currency,
        taxLabel: settings?.default_tax_label,
        taxRate: settings?.default_tax_rate,
      });
    }
    return {
      ...initialDoc,
      items: initialDoc.items?.length ? initialDoc.items : [emptyItem()],
      systems: initialDoc.systems || [],
      tax_label: initialDoc.tax_label ?? "GST",
      client_phone: initialDoc.client_phone || "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => setToast({ message, type });
  const [selectedClientId, setSelectedClientId] = useState("");
  const [saveAsNewClient, setSaveAsNewClient] = useState(false);

  // Settings load asynchronously (separate fetch), so on the very first
  // render they may not be ready yet when blankDoc() runs. Once they arrive,
  // backfill the currency/tax defaults — but only for a brand-new, untouched
  // document, never overwriting something already loaded for editing.
  useEffect(() => {
    if (!initialDoc && settings) {
      setDoc((d) =>
        d.id
          ? d
          : {
              ...d,
              currency: settings.default_currency || d.currency,
              tax_label: settings.default_tax_label ?? d.tax_label,
              tax_rate: settings.default_tax_rate ?? d.tax_rate,
            }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const set = (field) => (e) =>
    setDoc((d) => ({ ...d, [field]: e.target?.value ?? e }));

  // Picking a saved client fills in ALL of their info — name, email,
  // address, phone — in one go. Fields stay editable afterward in case
  // this particular job needs a tweaked address, etc.
  const handleClientSelect = (e) => {
    const clientId = e.target.value;
    setSelectedClientId(clientId);
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setDoc((d) => ({
      ...d,
      client_name: client.name || "",
      client_email: client.email || "",
      client_address: client.address || "",
      client_phone: client.phone || "",
    }));
  };

  const setDocType = (type) => {
    const titles = { quote: "Quote", invoice: "Invoice", receipt: "Receipt" };
    setDoc((d) => ({
      ...d,
      doc_type: type,
      doc_title: titles[type],
      // Only clear the number for unsaved docs — it'll be auto-assigned for
      // the new type on save. An already-saved doc keeps its existing number
      // if the user is just relabeling it (rare, but avoids surprise renumbering).
      doc_number: d.id ? d.doc_number : "",
    }));
  };

  // ---- flat items (no systems) ----
  const updateItem = (index, field, value) => {
    setDoc((d) => {
      const items = [...d.items];
      items[index] = { ...items[index], [field]: value };
      return { ...d, items };
    });
  };
  const addItem = () => setDoc((d) => ({ ...d, items: [...d.items, emptyItem()] }));
  const removeItem = (index) =>
    setDoc((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }));

  // ---- systems (grouped items) ----
  const updateSystemField = (sIndex, field, value) => {
    setDoc((d) => {
      const systems = [...d.systems];
      systems[sIndex] = { ...systems[sIndex], [field]: value };
      return { ...d, systems };
    });
  };
  const updateSystemItem = (sIndex, iIndex, field, value) => {
    setDoc((d) => {
      const systems = [...d.systems];
      const items = [...systems[sIndex].items];
      items[iIndex] = { ...items[iIndex], [field]: value };
      systems[sIndex] = { ...systems[sIndex], items };
      return { ...d, systems };
    });
  };
  const addSystem = () => setDoc((d) => ({ ...d, systems: [...d.systems, emptySystem()] }));
  const removeSystem = (sIndex) =>
    setDoc((d) => ({ ...d, systems: d.systems.filter((_, i) => i !== sIndex) }));
  const addSystemItem = (sIndex) => {
    setDoc((d) => {
      const systems = [...d.systems];
      systems[sIndex] = {
        ...systems[sIndex],
        items: [...systems[sIndex].items, emptyItem()],
      };
      return { ...d, systems };
    });
  };
  const removeSystemItem = (sIndex, iIndex) => {
    setDoc((d) => {
      const systems = [...d.systems];
      systems[sIndex] = {
        ...systems[sIndex],
        items: systems[sIndex].items.filter((_, i) => i !== iIndex),
      };
      return { ...d, systems };
    });
  };

  const toggleUseSystems = () => {
    setDoc((d) => ({
      ...d,
      use_systems: !d.use_systems,
      systems: !d.use_systems && d.systems.length === 0 ? [emptySystem()] : d.systems,
    }));
  };

  const totals = calcDocumentTotals({
    items: doc.items,
    systems: doc.systems,
    useSystems: doc.use_systems,
    taxRate: doc.tax_rate,
  });

  const handleSave = async () => {
    setSaving(true);

    let docNumber = doc.doc_number;
    if (!doc.id && !docNumber) {
      // Brand new document — get the next sequential number for this type
      // (e.g. the next "Q" number) from the atomic counter in Supabase.
      const { data: nextNum, error: numError } = await supabase.rpc(
        "get_next_doc_number",
        { p_doc_type: doc.doc_type }
      );
      if (numError) {
        showToast("Could not generate document number: " + numError.message, "error");
        setSaving(false);
        return;
      }
      docNumber = `${PREFIX[doc.doc_type]}-${nextNum}`;
    }

    // Optionally save this client's details for next time, if they
    // weren't picked from the saved list and the box is checked.
    if (saveAsNewClient && !selectedClientId && doc.client_name.trim()) {
      try {
        await addClient({
          name: doc.client_name,
          email: doc.client_email,
          address: doc.client_address,
          phone: doc.client_phone,
        });
      } catch (err) {
        // Don't block saving the document just because the client save failed.
        console.error("Could not save client:", err);
      }
    }

    const payload = {
      doc_type: doc.doc_type,
      doc_number: docNumber,
      doc_title: doc.doc_title,
      client_name: doc.client_name,
      client_email: doc.client_email,
      client_address: doc.client_address,
      client_phone: doc.client_phone,
      issue_date: doc.issue_date,
      due_date: doc.due_date || null,
      valid_until: doc.valid_until || null,
      items: doc.use_systems ? [] : doc.items,
      systems: doc.use_systems ? doc.systems : [],
      use_systems: doc.use_systems,
      show_unit_prices: doc.show_unit_prices,
      subtotal: totals.subtotal,
      tax_label: doc.tax_label,
      tax_rate: Number(doc.tax_rate || 0),
      tax_amount: totals.taxAmount,
      total: totals.total,
      currency: doc.currency,
      notes: doc.notes,
      terms: doc.terms,
      status: doc.status || "pending",
    };

    let error;
    if (doc.id) {
      ({ error } = await supabase.from("billing_documents").update(payload).eq("id", doc.id));
    } else {
      ({ error } = await supabase.from("billing_documents").insert([payload]));
    }
    setSaving(false);
    if (error) {
      showToast("Save failed: " + error.message, "error");
      return;
    }
    onSaved();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-white">
          {doc.id ? "Edit" : "New"} {doc.doc_title}
        </h2>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-slate-300" style={{ background: "#131d35" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-none px-5 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Doc type + number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Document Type</label>
          <select
            value={doc.doc_type}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none"
            style={inputStyle}
          >
            <option value="quote">Quote</option>
            <option value="invoice">Invoice</option>
            <option value="receipt">Receipt</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Doc Number</label>
          <input
            className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none disabled:opacity-50"
            style={inputStyle}
            value={doc.doc_number}
            placeholder="Auto-assigned on save"
            disabled={!doc.id}
            onChange={set("doc_number")}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Currency</label>
          <select value={doc.currency} onChange={set("currency")} className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle}>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      {/* Client info */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-1">Saved Client</label>
        <select
          value={selectedClientId}
          onChange={handleClientSelect}
          className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none mb-3"
          style={inputStyle}
        >
          <option value="">— Type client info manually, or pick one saved —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input placeholder="Client name" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_name} onChange={set("client_name")} />
          <input placeholder="Client email" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_email} onChange={set("client_email")} />
          <input placeholder="Client phone" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_phone} onChange={set("client_phone")} />
          <input placeholder="Client address" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_address} onChange={set("client_address")} />
        </div>

        {!selectedClientId && doc.client_name.trim() && (
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsNewClient}
              onChange={() => setSaveAsNewClient((v) => !v)}
            />
            Save this as a new client for next time
          </label>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Issue Date</label>
          <input type="date" className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.issue_date} onChange={set("issue_date")} />
        </div>
        {doc.doc_type === "invoice" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Due Date</label>
            <input type="date" className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.due_date || ""} onChange={set("due_date")} />
          </div>
        )}
        {doc.doc_type === "quote" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Valid Until</label>
            <input type="date" className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.valid_until || ""} onChange={set("valid_until")} />
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mb-2">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={doc.show_unit_prices} onChange={() => setDoc((d) => ({ ...d, show_unit_prices: !d.show_unit_prices }))} />
            Show unit prices
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={doc.use_systems} onChange={toggleUseSystems} />
            Group items by system
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            Tax label:
            <input
              type="text"
              className="w-20 sm:w-24 rounded-lg px-2 py-1 text-white text-sm outline-none"
              style={inputStyle}
              placeholder="GST"
              value={doc.tax_label}
              onChange={set("tax_label")}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            Tax %:
            <input
              type="number"
              className="w-16 sm:w-20 rounded-lg px-2 py-1 text-white text-sm outline-none"
              style={inputStyle}
              value={doc.tax_rate}
              onChange={set("tax_rate")}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-6">
        Leave Tax % at 0 to leave tax off this document entirely.
      </p>

      {/* Items / Systems */}
      {!doc.use_systems ? (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Items</h3>
          <ItemRowHeader showUnitPrices={doc.show_unit_prices} />
          {doc.items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              showUnitPrices={doc.show_unit_prices}
              onChange={(field, value) => updateItem(idx, field, value)}
              onRemove={() => removeItem(idx)}
            />
          ))}
          <button onClick={addItem} className="text-sm mt-2" style={{ color: "#2dce89" }}>
            + Add Item
          </button>
        </div>
      ) : (
        <div className="mb-6 space-y-5">
          {doc.systems.map((system, sIdx) => (
            <div key={system.id} className="rounded-xl p-4" style={{ background: "#131d35" }}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <input
                  className="rounded-lg px-3 py-2 text-white text-sm font-semibold outline-none w-full sm:w-1/2"
                  style={inputStyle}
                  value={system.name}
                  onChange={(e) => updateSystemField(sIdx, "name", e.target.value)}
                />
                <button onClick={() => removeSystem(sIdx)} className="text-sm text-left sm:text-right" style={{ color: "#f5365c" }}>
                  Remove System
                </button>
              </div>
              <ItemRowHeader showUnitPrices={doc.show_unit_prices} />
              {system.items.map((item, iIdx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showUnitPrices={doc.show_unit_prices}
                  onChange={(field, value) => updateSystemItem(sIdx, iIdx, field, value)}
                  onRemove={() => removeSystemItem(sIdx, iIdx)}
                />
              ))}
              <button onClick={() => addSystemItem(sIdx)} className="text-sm mt-1" style={{ color: "#2dce89" }}>
                + Add Item to {system.name}
              </button>
            </div>
          ))}
          <button onClick={addSystem} className="text-sm" style={{ color: "#11cdef" }}>
            + Add System
          </button>
        </div>
      )}

      {/* Notes & Terms */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <textarea rows={3} className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.notes} onChange={set("notes")} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Terms & Conditions</label>
          <textarea rows={3} className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.terms} onChange={set("terms")} />
        </div>
      </div>

      {/* Totals preview */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.15)" }}>
        <div className="flex justify-between text-slate-400 text-sm mb-1">
          <span>Subtotal</span>
          <span>{fmtMoney(totals.subtotal, doc.currency)}</span>
        </div>
        {Number(doc.tax_rate) > 0 && (
          <div className="flex justify-between text-slate-400 text-sm mb-1">
            <span>{doc.tax_label || "Tax"} ({doc.tax_rate}%)</span>
            <span>{fmtMoney(totals.taxAmount, doc.currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-white font-bold text-lg mt-2">
          <span>Total</span>
          <span style={{ color: "#2dce89" }}>{fmtMoney(totals.total, doc.currency)}</span>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
