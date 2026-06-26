import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../api/supabaseClient";
import { fmtMoney } from "../../lib/pdfGenerator";

function StatCard({ label, value, accent }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.1)" }}
    >
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: accent || "#fff" }}>
        {value}
      </p>
    </div>
  );
}

export default function OverviewTab({ onNavigate }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setDocuments(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) return <p className="text-slate-400">Loading...</p>;

  const quotes = documents.filter((d) => d.doc_type === "quote");
  const invoices = documents.filter((d) => d.doc_type === "invoice");
  const receipts = documents.filter((d) => d.doc_type === "receipt");

  // "Outstanding" = invoices that haven't been converted to a receipt yet.
  // We treat status !== 'paid' as unpaid, which matches how conversion sets it.
  const outstandingInvoices = invoices.filter((d) => d.status !== "paid");
  const outstandingTotal = outstandingInvoices.reduce(
    (sum, d) => sum + Number(d.total || 0),
    0
  );
  const paidTotal = receipts.reduce((sum, d) => sum + Number(d.total || 0), 0);

  // Currency for display — use the most common one across docs, default CAD.
  const currency = documents[0]?.currency || "CAD";

  const recent = documents.slice(0, 6);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Quotes" value={quotes.length} />
        <StatCard label="Invoices" value={invoices.length} />
        <StatCard label="Receipts" value={receipts.length} />
        <StatCard label="Outstanding" value={fmtMoney(outstandingTotal, currency)} accent="#f5365c" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <StatCard label="Total received (receipts)" value={fmtMoney(paidTotal, currency)} accent="#2dce89" />
        <StatCard
          label="Unpaid invoices"
          value={`${outstandingInvoices.length} document${outstandingInvoices.length === 1 ? "" : "s"}`}
          accent="#11cdef"
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">Recent activity</h3>
        <button
          onClick={() => onNavigate?.("billing")}
          className="text-sm"
          style={{ color: "#2dce89" }}
        >
          View all →
        </button>
      </div>

      {recent.length === 0 ? (
        <p className="text-slate-400">No documents yet — create your first quote to get started.</p>
      ) : (
        <div className="space-y-2">
          {recent.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg px-4 py-3 flex items-center justify-between"
              style={{ background: "#131d35" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase"
                  style={{ background: "rgba(45,206,137,0.15)", color: "#2dce89" }}
                >
                  {doc.doc_type}
                </span>
                <span className="text-white text-sm font-medium">{doc.doc_number}</span>
                <span className="text-slate-400 text-sm">{doc.client_name}</span>
              </div>
              <span className="text-slate-300 text-sm">
                {fmtMoney(doc.total, doc.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
