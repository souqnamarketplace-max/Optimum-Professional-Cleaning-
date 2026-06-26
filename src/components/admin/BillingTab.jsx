import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../api/supabaseClient";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useGmailSend } from "../../hooks/useGmailSend";
import DocumentEditor from "./DocumentEditor";
import ConfirmModal from "./ConfirmModal";
import Toast from "./Toast";
import { downloadDocumentPDF, getDocumentPDFBlob, calcDocumentTotals, fmtMoney } from "../../lib/pdfGenerator";
import { buildDocEmail } from "../../lib/emailTemplates";

const DOC_TYPES = ["quote", "invoice", "receipt"];

export default function BillingTab({ initialClientFilter, onClientFilterConsumed }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState(null); // null = list view, "new" = creating, object = editing
  const [filterType, setFilterType] = useState("all");
  const [clientSearch, setClientSearch] = useState(initialClientFilter?.name || initialClientFilter?.email || "");
  const [downloadingId, setDownloadingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { title, message, detail, onConfirm, destructive }
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  const { settings } = useSiteSettings();
  const gmail = useGmailSend();

  const showToast = (message, type = "success") => setToast({ message, type });

  // If we arrived here from "View billing" on a client card, the filter
  // is already applied via clientSearch's initial value above — this just
  // tells Dashboard it's been picked up, so switching away and back to
  // Billing later doesn't re-apply a stale filter unexpectedly.
  useEffect(() => {
    if (initialClientFilter) onClientFilterConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleDelete = (id) => {
    setConfirmState({
      title: "Delete this document?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        setConfirmState(null);
        await supabase.from("billing_documents").delete().eq("id", id);
        fetchDocuments();
      },
    });
  };

  const PREFIX = { quote: "Q", invoice: "INV", receipt: "REC" };

  const handleConvert = async (doc, targetType) => {
    // Get the next sequential number for the target type (e.g. next "Q" or "INV" number)
    const { data: nextNum, error: numError } = await supabase.rpc(
      "get_next_doc_number",
      { p_doc_type: targetType }
    );
    if (numError) {
      showToast("Could not generate document number: " + numError.message, "error");
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
      showToast("Conversion failed: " + error.message, "error");
      return;
    }

    // Converting an invoice to a receipt means it's been paid — mark the
    // original invoice as 'paid' too, so it stops counting toward
    // Outstanding on the Overview tab. Without this, the invoice and its
    // receipt are only linked one-way (receipt → invoice via
    // linked_invoice_id) and the invoice would look unpaid forever even
    // after a receipt was issued for it.
    if (targetType === "receipt" && doc.doc_type === "invoice") {
      const { error: statusError } = await supabase
        .from("billing_documents")
        .update({ status: "paid" })
        .eq("id", doc.id);
      if (statusError) {
        // Don't block the conversion over this — the receipt was created
        // successfully — but let the person know the invoice wasn't marked.
        showToast(
          `Receipt created, but couldn't mark the invoice as paid: ${statusError.message}`,
          "error"
        );
        fetchDocuments();
        return;
      }
    }

    fetchDocuments();
    showToast(`Converted to ${targetType} ${PREFIX[targetType]}-${nextNum}.`);
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
    etransferEmail: settings?.etransfer_email,
    bankInstitution: settings?.bank_institution,
    bankTransit: settings?.bank_transit,
    bankAccount: settings?.bank_account,
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

  // There's no browser API to attach a file to an email automatically
  // unless we're actually sending through an account the customer has
  // connected. When Gmail is connected (Settings → Connect Gmail), this
  // sends the email for real — PDF attached, auto-written subject/body,
  // signature included — as the customer's own Gmail account.
  // When Gmail isn't connected, it falls back to downloading the PDF and
  // opening a mailto: draft for the customer to attach manually.
  const handleSend = async (doc) => {
    if (gmail.isConnected) {
      const { subject, body } = buildDocEmail(
        {
          doc_type: doc.doc_type,
          doc_number: doc.doc_number,
          client_name: doc.client_name,
          due_date: doc.due_date,
          valid_until: doc.valid_until,
          total: doc.total,
          currency: doc.currency,
        },
        settings
      );

      if (!doc.client_email) {
        showToast("This document has no client email saved — add one before sending.", "error");
        return;
      }

      setConfirmState({
        title: `Send this ${doc.doc_type}?`,
        message: `To ${doc.client_email}\nFrom ${gmail.connectedEmail}`,
        detail: `Subject: ${subject}`,
        confirmLabel: "Send",
        onConfirm: async () => {
          setConfirmState(null);
          setSendingId(doc.id);
          try {
            const pdfBlob = await getDocumentPDFBlob(mapDocForPdf(doc), companySettingsForPdf());
            await gmail.sendEmail({
              to: doc.client_email,
              subject,
              bodyText: body,
              pdfBlob,
              pdfFilename: `${doc.doc_type}-${doc.doc_number}.pdf`,
            });
            showToast(`Sent to ${doc.client_email}.`);
          } catch (err) {
            showToast("Send failed: " + err.message, "error");
          } finally {
            setSendingId(null);
          }
        },
      });
      return;
    }

    // Fallback: no Gmail connected — download + open a mailto draft instead.
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

    const { subject, body } = buildDocEmail(
      {
        doc_type: doc.doc_type,
        doc_number: doc.doc_number,
        client_name: doc.client_name,
        due_date: doc.due_date,
        valid_until: doc.valid_until,
        total: doc.total,
        currency: doc.currency,
      },
      settings
    );
    const noteForManualAttach =
      `${body}\n\n(The PDF was just downloaded — attach it to this email before sending.)`;

    const mailtoUrl = `mailto:${encodeURIComponent(doc.client_email || "")}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(noteForManualAttach)}`;

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

  const filtered = documents
    .filter((d) => filterType === "all" || d.doc_type === filterType)
    .filter((d) => {
      if (!clientSearch.trim()) return true;
      const q = clientSearch.trim().toLowerCase();
      return (
        d.client_name?.toLowerCase().includes(q) ||
        d.client_email?.toLowerCase().includes(q)
      );
    });

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="text"
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          placeholder="Search by client name or email..."
          className="w-full sm:max-w-xs rounded-lg px-4 py-2 text-white text-sm outline-none"
          style={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.08)" }}
        />
        {clientSearch.trim() && (
          <button
            onClick={() => setClientSearch("")}
            className="text-sm text-slate-400 hover:text-white text-left sm:text-center"
          >
            Clear filter
          </button>
        )}
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
        <p className="text-slate-400">
          {documents.length === 0
            ? "No documents yet."
            : "No documents match this filter."}
        </p>
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
                    {doc.doc_type === "invoice" && doc.status === "paid" && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(45,206,137,0.15)", color: "#2dce89" }}
                      >
                        Paid
                      </span>
                    )}
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
                    disabled={downloadingId === doc.id || sendingId === doc.id}
                    className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: "#0f1729", color: "#2dce89" }}
                    title={
                      gmail.isConnected
                        ? `Sends from ${gmail.connectedEmail} with the PDF attached`
                        : "Downloads the PDF, then opens your email app — attach the downloaded file before sending"
                    }
                  >
                    {sendingId === doc.id
                      ? "Sending..."
                      : downloadingId === doc.id
                      ? "Preparing..."
                      : gmail.isConnected
                      ? "Send"
                      : "Send (manual)"}
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

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
