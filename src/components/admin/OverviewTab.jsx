import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../api/supabaseClient";
import { fmtMoney } from "../../lib/pdfGenerator";

function StatCard({ label, value, accent }) {
  return (
    <div
      className="rounded-xl p-4 sm:p-5 min-w-0"
      style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.1)" }}
    >
      <p className="text-slate-400 text-xs sm:text-sm mb-1 truncate">{label}</p>
      <p
        className="text-lg sm:text-2xl font-bold break-words"
        style={{ color: accent || "#fff" }}
      >
        {value}
      </p>
    </div>
  );
}

// Quick date-range presets. "All time" is the default so the dashboard
// doesn't surprise anyone by hiding older documents on first load.
const RANGE_PRESETS = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom" },
];

function getRangeBounds(presetKey, customFrom, customTo) {
  const now = new Date();
  if (presetKey === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
  }
  if (presetKey === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }
  if (presetKey === "90d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 90);
    return { from, to: now };
  }
  if (presetKey === "custom") {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(customTo) : null,
    };
  }
  return { from: null, to: null }; // "all"
}

export default function OverviewTab({ onNavigate }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  const { from, to } = getRangeBounds(rangeKey, customFrom, customTo);
  // Filtered by issue_date (the date that actually appears on the
  // document), not created_at — a backdated quote should count toward
  // the period it was issued for, not the day someone happened to type it in.
  const inRange = (doc) => {
    if (!doc.issue_date) return rangeKey === "all";
    const issued = new Date(doc.issue_date);
    if (from && issued < from) return false;
    if (to && issued > to) return false;
    return true;
  };
  const documentsInRange = rangeKey === "all" ? documents : documents.filter(inRange);

  const quotes = documentsInRange.filter((d) => d.doc_type === "quote");
  const invoices = documentsInRange.filter((d) => d.doc_type === "invoice");
  const receipts = documentsInRange.filter((d) => d.doc_type === "receipt");

  // "Outstanding" = invoices that haven't been converted to a receipt yet.
  // We treat status !== 'paid' as unpaid, which matches how conversion sets it.
  const outstandingInvoices = invoices.filter((d) => d.status !== "paid");
  const outstandingTotal = outstandingInvoices.reduce(
    (sum, d) => sum + Number(d.total || 0),
    0
  );
  const paidTotal = receipts.reduce((sum, d) => sum + Number(d.total || 0), 0);

  // Currency for display — use the most common one across docs, default CAD.
  const currency = documentsInRange[0]?.currency || documents[0]?.currency || "CAD";

  const recent = documentsInRange.slice(0, 6);

  const inputStyle = {
    background: "#0f1729",
    border: "1px solid rgba(255,255,255,0.08)",
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-white">Overview</h2>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setRangeKey(preset.key)}
              className="px-3 py-1.5 rounded-full text-sm shrink-0"
              style={{
                background: rangeKey === preset.key ? "#2dce89" : "#131d35",
                color: rangeKey === preset.key ? "#0a0e1a" : "#94a3b8",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {rangeKey === "custom" && (
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg px-3 py-2 text-white text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg px-3 py-2 text-white text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>
      )}

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
        <p className="text-slate-400">
          {rangeKey === "all"
            ? "No documents yet — create your first quote to get started."
            : "No documents in this date range."}
        </p>
      ) : (
        <div className="space-y-2">
          {recent.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              style={{ background: "#131d35" }}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase shrink-0"
                  style={{ background: "rgba(45,206,137,0.15)", color: "#2dce89" }}
                >
                  {doc.doc_type}
                </span>
                <span className="text-white text-sm font-medium shrink-0">{doc.doc_number}</span>
                <span className="text-slate-400 text-sm truncate">{doc.client_name}</span>
              </div>
              <span className="text-slate-300 text-sm shrink-0">
                {fmtMoney(doc.total, doc.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
