import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../api/supabaseClient";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import DocumentEditor from "./DocumentEditor";
import { downloadDocumentPDF, calcDocumentTotals, fmtMoney } from "../../lib/pdfGenerator";

const DOC_TYPES = ["quote", "invoice", "receipt"];

export default function BillingTab() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState(null); // null = list view, "new" = creating, object = editing
  const [filterType, setFilterType] = useState("all");
  const [downloadingId, setDownloadingId] = useState(null);
  const { settings } = useSiteSettings();

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setDocuments(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    await supabase.from("billing_documents").delete().eq("id", id);
    fetchDocuments();
  };

  const PREFIX = { quote: "Q", invoice: "INV", receipt: "REC" };

  const handleConvert = async (doc, targetType) => {
    // Get the next sequential number for the target type (e.g. next "Q" or "INV" number)
    const { data: nextNum, error: numError } = await supabase.rpc(
      "get_next_doc_number",
      { p_doc_type: targetType }
    );
    if (numError) {
      alert("Could not generate document number: " + numError.message);
      return;
    }

    const payload = {
      doc_type: targetType,
      doc_number: `${PREFIX[targetType]}-${nextNum}`,
      client_name: doc.client_name,
      client_email: doc.client_email,
      client_address: doc.client_address,
      client_phone: doc.client_phone,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: targetType === "invoice" ? doc.due_date : null,
      valid_until: targetType === "quote" ? doc.valid_until : null,
      items: doc.items,
      systems: doc.systems,
      subtotal: doc.subtotal,
      tax_label: doc.tax_label,
      tax_rate: doc.tax_rate,
      tax_amount: doc.tax_amount,
      total: doc.total,
      notes: doc.notes,
      terms: doc.terms,
      doc_title: targetType.charAt(0).toUpperCase() + targetType.slice(1),
      currency: doc.currency,
      status: targetType === "receipt" ? "paid" : "pending",
      linked_invoice_id: targetType === "receipt" ? doc.id : doc.linked_invoice_id,
      converted_from: doc.doc_number,
      show_unit_prices: doc.show_unit_prices,
      use_systems: doc.use_systems,
    };
    const { error } = await supabase.from("billing_documents").insert([payload]);
    if (error) {
      alert("Conversion failed: " + error.message);
      return;
    }
    fetchDocuments();
  };

  // Shared mapping from the Supabase row shape to what generateDocumentPDF
  // expects — used by both the PDF download button and the Send flow so
  // they can never drift apart.
  const mapDocForPdf = (doc) => ({
    docType: doc.doc_type,
    docNumber: doc.doc_number,
    docTitle: doc.doc_title,
    clientName: doc.client_name,
    clientEmail: doc.client_email,
    clientAddress: doc.client_address,
    issueDate: doc.issue_date,
    dueDate: doc.due_date,
    validUntil: doc.valid_until,
    convertedFrom: doc.converted_from,
    items: doc.items || [],
    systems: doc.systems || [],
    useSystems: doc.use_systems,
    showUnitPrices: doc.show_unit_prices,
    taxLabel: doc.tax_label,
    taxRate: doc.tax_rate,
    currency: doc.currency,
    notes: doc.notes,
    terms: doc.terms,
  });

  const companySettingsForPdf = () => ({
    companyName: settings?.company_name,
    email: settings?.email,
    website: settings?.website,
    address: settings?.address,
    logoUrl: settings?.logo_url,
  });

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await downloadDocumentPDF(
        mapDocForPdf(doc),
        companySettingsForPdf(),
        `${doc.doc_type}-${doc.doc_number}.pdf`
      );
    } finally {
      setDownloadingId(null);
    }
  };

  // There's no browser API to attach a file to an email automatically —
  // attaching always requires a person to do it once the compose window is
  // open. So "Send" does the next best thing: downloads the PDF (so it's
  // sitting in Downloads ready to drag in), then opens a mailto: link,
  // which launches whatever email app/account the customer already has set
  // as default (Gmail, Outlook, Apple Mail, etc) with the subject, body,
  // and client's address pre-filled — sent from the business's own email,
  // since that's whichever account is logged into their default mail app.
  const handleSend = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await downloadDocumentPDF(
        mapDocForPdf(doc),
        companySettingsForPdf(),
        `${doc.doc_type}-${doc.doc_number}.pdf`
      );
    } finally {
      setDownloadingId(null);
    }

    const senderName = settings?.company_name || "";
    const subject = `${doc.doc_title || doc.doc_type} ${doc.doc_number}`;
    const body =
      `Hi ${doc.client_name || ""},\n\n` +
      `Please find attached your ${doc.doc_type} ${doc.doc_number}.\n\n` +
      `The PDF was just downloaded to your computer — attach it to this email before sending.\n\n` +
      `Thank you,\n${senderName}`;

    const mailtoUrl = `mailto:${encodeURIComponent(doc.client_email || "")}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    // A brief delay so the download has visibly started before the email
    // app takes over focus — purely a UX nicety, not required for either to work.
    setTimeout(() => {
      window.location.href = mailtoUrl;
    }, 400);
  };

  if (editingDoc !== null) {
    return (
      <DocumentEditor
        initialDoc={editingDoc === "new" ? null : editingDoc}
        onSaved={() => {
          setEditingDoc(null);
          fetchDocuments();
        }}
        onCancel={() => setEditingDoc(null)}
      />
    );
  }

  const filtered =
    filterType === "all" ? documents : documents.filter((d) => d.doc_type === filterType);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-white">Billing</h2>
        <button
          onClick={() => setEditingDoc("new")}
          className="rounded-lg px-4 sm:px-5 py-2.5 font-semibold text-white text-sm transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #2dce89, #11cdef)" }}
        >
          + New Document
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {["all", ...DOC_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className="px-4 py-1.5 rounded-full text-sm capitalize shrink-0"
            style={{
              background: filterType === t ? "#2dce89" : "#131d35",
              color: filterType === t ? "#0a0e1a" : "#94a3b8",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400">No documents yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => {
            const totals = calcDocumentTotals({
              items: doc.items || [],
              systems: doc.systems || [],
              useSystems: doc.use_systems,
              taxRate: doc.tax_rate,
            });
            return (
              <div
                key={doc.id}
                className="rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.1)" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase"
                      style={{ background: "rgba(45,206,137,0.15)", color: "#2dce89" }}
                    >
                      {doc.doc_type}
                    </span>
                    <span className="text-white font-semibold">{doc.doc_number}</span>
                  </div>
                  <p className="text-slate-400 text-sm truncate">
                    {doc.client_name} · {fmtMoney(totals.total, doc.currency)} · {doc.issue_date}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setEditingDoc(doc)}
                    className="text-sm px-3 py-1.5 rounded-lg text-slate-300 hover:text-white"
                    style={{ background: "#0f1729" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: "#0f1729", color: "#11cdef" }}
                  >
                    {downloadingId === doc.id ? "Generating..." : "PDF"}
                  </button>
                  <button
                    onClick={() => handleSend(doc)}
                    disabled={downloadingId === doc.id}
                    className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: "#0f1729", color: "#2dce89" }}
                    title="Downloads the PDF, then opens your email app — attach the downloaded file before sending"
                  >
                    {downloadingId === doc.id ? "Preparing..." : "Send"}
                  </button>
                  {doc.doc_type === "quote" && (
                    <button
                      onClick={() => handleConvert(doc, "invoice")}
                      className="text-sm px-3 py-1.5 rounded-lg text-white"
                      style={{ background: "rgba(45,206,137,0.2)" }}
                    >
                      → Invoice
                    </button>
                  )}
                  {doc.doc_type === "invoice" && (
                    <button
                      onClick={() => handleConvert(doc, "receipt")}
                      className="text-sm px-3 py-1.5 rounded-lg text-white"
                      style={{ background: "rgba(45,206,137,0.2)" }}
                    >
                      → Receipt
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-sm px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(245,54,92,0.1)", color: "#f5365c" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
