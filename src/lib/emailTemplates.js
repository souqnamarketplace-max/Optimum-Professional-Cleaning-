import { fmtMoney } from "./pdfGenerator";

// Builds the signature block from whatever's filled in on Settings.
// Lines that are empty are skipped entirely rather than showing blank rows.
export function buildSignature(settings) {
  const lines = [
    settings?.company_name,
    settings?.phone,
    settings?.email,
    settings?.website,
  ].filter(Boolean);
  return lines.join("\n");
}

const DOC_COPY = {
  quote: {
    subject: (doc) => `Quote ${doc.doc_number} from {company}`,
    intro: (doc) =>
      `Please find attached your quote ${doc.doc_number}` +
      (doc.valid_until ? `, valid until ${doc.valid_until}.` : "."),
    closing:
      "If you have any questions or would like to move forward, just reply to this email and we'll get it scheduled.",
  },
  invoice: {
    subject: (doc) => `Invoice ${doc.doc_number} from {company}`,
    intro: (doc) =>
      `Please find attached invoice ${doc.doc_number}` +
      (doc.due_date ? `, due ${doc.due_date}.` : "."),
    closing: "Let us know if you have any questions about this invoice.",
  },
  receipt: {
    subject: (doc) => `Receipt ${doc.doc_number} from {company}`,
    intro: (doc) => `Thank you for your payment — attached is your receipt ${doc.doc_number}.`,
    closing: "We appreciate your business!",
  },
};

// Builds the full subject + body text for a document's email, in the
// document's own voice (a quote reads differently from a receipt), with
// the company signature appended automatically from Settings.
export function buildDocEmail(doc, settings) {
  const copy = DOC_COPY[doc.doc_type] || DOC_COPY.invoice;
  const companyName = settings?.company_name || "us";

  const subject = copy.subject(doc).replace("{company}", companyName);

  const totals = doc.total != null ? fmtMoney(doc.total, doc.currency) : null;

  const bodyLines = [
    `Hi ${doc.client_name || "there"},`,
    "",
    copy.intro(doc),
    totals ? `Total: ${totals}` : null,
    "",
    copy.closing,
    "",
    "Thank you,",
    buildSignature(settings),
  ].filter((line) => line !== null);

  return { subject, body: bodyLines.join("\n") };
}
