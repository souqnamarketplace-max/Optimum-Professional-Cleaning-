import React, { useState } from "react";
import { useClients } from "../../hooks/useClients";
import ConfirmModal from "./ConfirmModal";
import Toast from "./Toast";

const inputStyle = {
  background: "#0f1729",
  border: "1px solid rgba(255,255,255,0.08)",
};

const emptyForm = { name: "", email: "", address: "", phone: "", notes: "" };

export default function ClientsTab() {
  const { clients, loading, addClient, updateClient, deleteClient } = useClients();
  const [editingId, setEditingId] = useState(null); // null = list, "new" = adding, id = editing
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => setToast({ message, type });

  const startNew = () => {
    setForm(emptyForm);
    setEditingId("new");
  };

  const startEdit = (client) => {
    setForm({
      name: client.name || "",
      email: client.email || "",
      address: client.address || "",
      phone: client.phone || "",
      notes: client.notes || "",
    });
    setEditingId(client.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast("Client name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingId === "new") {
        await addClient(form);
        showToast(`${form.name} added.`);
      } else {
        await updateClient(editingId, form);
        showToast(`${form.name} updated.`);
      }
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      showToast("Save failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    setConfirmState({
      title: "Delete this client?",
      message: "This won't affect past quotes or invoices.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteClient(id);
          showToast(`${name} deleted.`);
        } catch (err) {
          showToast("Delete failed: " + err.message, "error");
        }
      },
    });
  };

  if (editingId !== null) {
    return (
      <div className="max-w-xl">
        <h2 className="text-xl font-bold text-white mb-6">
          {editingId === "new" ? "New Client" : "Edit Client"}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Name *</label>
            <input
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={inputStyle}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Phone</label>
            <input
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={inputStyle}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Address</label>
            <input
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={inputStyle}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Notes (internal only)</label>
            <textarea
              rows={3}
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={inputStyle}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setEditingId(null)}
            className="px-4 py-2 rounded-lg text-slate-300"
            style={{ background: "#131d35" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
          >
            {saving ? "Saving..." : "Save Client"}
          </button>
        </div>

        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Clients</h2>
        <button
          onClick={startNew}
          className="rounded-lg px-5 py-2.5 font-semibold text-white text-sm transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
        >
          + New Client
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : clients.length === 0 ? (
        <p className="text-slate-400">
          No saved clients yet. Add one here, or save a new client directly while creating a Quote.
        </p>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.1)" }}
            >
              <div className="min-w-0">
                <p className="text-white font-semibold">{client.name}</p>
                <p className="text-slate-400 text-sm truncate">
                  {[client.email, client.phone, client.address].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(client)}
                  className="text-sm px-3 py-1.5 rounded-lg text-slate-300 hover:text-white"
                  style={{ background: "#0f1729" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(client.id, client.name)}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(245,54,92,0.1)", color: "#f5365c" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
