import React, { useState } from "react";
import { supabase } from "../../api/supabaseClient";
import { calcDocumentTotals, fmtMoney } from "../../lib/pdfGenerator";

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

function blankDoc() {
  return {
    doc_type: "quote",
    doc_number: `QUO-${Date.now().toString().slice(-6)}`,
    doc_title: "Quote",
    client_name: "",
    client_email: "",
    client_address: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    valid_until: "",
    items: [emptyItem()],
    systems: [],
    use_systems: false,
    show_unit_prices: true,
    tax_rate: 0,
    currency: "USD",
    notes: "",
    terms: "",
    status: "pending",
  };
}

export default function DocumentEditor({ initialDoc, onSaved, onCancel }) {
  const [doc, setDoc] = useState(() => {
    if (!initialDoc) return blankDoc();
    return {
      ...initialDoc,
      items: initialDoc.items?.length ? initialDoc.items : [emptyItem()],
      systems: initialDoc.systems || [],
    };
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setDoc((d) => ({ ...d, [field]: e.target?.value ?? e }));

  const setDocType = (type) => {
    const titles = { quote: "Quote", invoice: "Invoice", receipt: "Receipt" };
    setDoc((d) => ({
      ...d,
      doc_type: type,
      doc_title: titles[type],
      doc_number: `${type.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-6)}`,
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
    const payload = {
      doc_type: doc.doc_type,
      doc_number: doc.doc_number,
      doc_title: doc.doc_title,
      client_name: doc.client_name,
      client_email: doc.client_email,
      client_address: doc.client_address,
      issue_date: doc.issue_date,
      due_date: doc.due_date || null,
      valid_until: doc.valid_until || null,
      items: doc.use_systems ? [] : doc.items,
      systems: doc.use_systems ? doc.systems : [],
      use_systems: doc.use_systems,
      show_unit_prices: doc.show_unit_prices,
      subtotal: totals.subtotal,
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
      alert("Save failed: " + error.message);
      return;
    }
    onSaved();
  };

  const inputStyle = {
    background: "#0f1729",
    border: "1px solid rgba(255,255,255,0.08)",
  };

  const ItemRow = ({ item, onChange, onRemove }) => (
    <div className="grid grid-cols-12 gap-2 items-start mb-2">
      <input
        className="col-span-4 rounded-lg px-3 py-2 text-white text-sm outline-none"
        style={inputStyle}
        placeholder="Item name"
        value={item.name}
        onChange={(e) => onChange("name", e.target.value)}
      />
      <input
        className="col-span-3 rounded-lg px-3 py-2 text-white text-sm outline-none"
        style={inputStyle}
        placeholder="Detail (optional)"
        value={item.detail}
        onChange={(e) => onChange("detail", e.target.value)}
      />
      <input
        type="number"
        className="col-span-1 rounded-lg px-2 py-2 text-white text-sm outline-none"
        style={inputStyle}
        value={item.qty}
        onChange={(e) => onChange("qty", Number(e.target.value))}
      />
      {doc.show_unit_prices && (
        <>
          <input
            type="number"
            className="col-span-2 rounded-lg px-2 py-2 text-white text-sm outline-none"
            style={inputStyle}
            value={item.unitPrice}
            onChange={(e) => onChange("unitPrice", Number(e.target.value))}
          />
          <input
            type="number"
            className="col-span-1 rounded-lg px-2 py-2 text-white text-sm outline-none"
            style={inputStyle}
            value={item.discount}
            onChange={(e) => onChange("discount", Number(e.target.value))}
            title="Discount %"
          />
        </>
      )}
      <button
        onClick={onRemove}
        className="col-span-1 text-sm rounded-lg py-2"
        style={{ color: "#f5365c" }}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">
          {doc.id ? "Edit" : "New"} {doc.doc_title}
        </h2>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-slate-300" style={{ background: "#131d35" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Doc type + number */}
      <div className="grid grid-cols-3 gap-3 mb-4">
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
          <input className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.doc_number} onChange={set("doc_number")} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Currency</label>
          <select value={doc.currency} onChange={set("currency")} className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle}>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      {/* Client info */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <input placeholder="Client name" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_name} onChange={set("client_name")} />
        <input placeholder="Client email" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_email} onChange={set("client_email")} />
        <input placeholder="Client address" className="rounded-lg px-3 py-2 text-white text-sm outline-none" style={inputStyle} value={doc.client_address} onChange={set("client_address")} />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
      <div className="flex items-center gap-6 mb-6">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={doc.show_unit_prices} onChange={() => setDoc((d) => ({ ...d, show_unit_prices: !d.show_unit_prices }))} />
          Show unit prices
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={doc.use_systems} onChange={toggleUseSystems} />
          Group items by system
        </label>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          Tax %:
          <input
            type="number"
            className="w-20 rounded-lg px-2 py-1 text-white text-sm outline-none"
            style={inputStyle}
            value={doc.tax_rate}
            onChange={set("tax_rate")}
          />
        </div>
      </div>

      {/* Items / Systems */}
      {!doc.use_systems ? (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Items</h3>
          {doc.items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
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
              <div className="flex items-center justify-between mb-3">
                <input
                  className="rounded-lg px-3 py-2 text-white text-sm font-semibold outline-none w-1/2"
                  style={inputStyle}
                  value={system.name}
                  onChange={(e) => updateSystemField(sIdx, "name", e.target.value)}
                />
                <button onClick={() => removeSystem(sIdx)} className="text-sm" style={{ color: "#f5365c" }}>
                  Remove System
                </button>
              </div>
              {system.items.map((item, iIdx) => (
                <ItemRow
                  key={item.id}
                  item={item}
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
      <div className="grid grid-cols-2 gap-4 mb-6">
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
            <span>Tax ({doc.tax_rate}%)</span>
            <span>{fmtMoney(totals.taxAmount, doc.currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-white font-bold text-lg mt-2">
          <span>Total</span>
          <span style={{ color: "#2dce89" }}>{fmtMoney(totals.total, doc.currency)}</span>
        </div>
      </div>
    </div>
  );
}
