import jsPDF from "jspdf";

// ---------- helpers ----------

const fmtMoney = (n, currency = "USD") => {
  const symbols = { USD: "$", CAD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || "";
  const val = Number(n || 0).toFixed(2);
  return `${symbol}${val}`;
};

// Loads an image URL (e.g. Supabase Storage public URL) and converts it to
// a base64 data URL + its natural pixel size, since jsPDF can only embed
// images it already has as base64 — it cannot fetch a remote URL itself.
const loadImageAsDataUrl = (url) =>
  new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } catch (e) {
        // Canvas can throw on cross-origin taint even with crossOrigin set,
        // depending on the storage host's CORS headers. Fail soft — the PDF
        // still generates, just without the logo, instead of crashing.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

// A row only prints in the PDF if it actually has something in it —
// an empty placeholder row (no name, no price) is skipped rather than
// showing up as a blank numbered line on the document.
const hasItemContent = (item) =>
  Boolean(item?.name?.trim()) || Number(item?.unitPrice) > 0;

const calcLineTotal = (item) => {
  const qty = Number(item.qty || 0);
  const price = Number(item.unitPrice || 0);
  const discountPct = Number(item.discount || 0);
  const gross = qty * price;
  const discountAmount = gross * (discountPct / 100);
  return gross - discountAmount;
};

const calcGroupSubtotal = (items) =>
  items.reduce((sum, item) => sum + calcLineTotal(item), 0);

const calcDocumentTotals = (doc) => {
  let subtotal = 0;
  if (doc.useSystems && doc.systems?.length) {
    doc.systems.forEach((system) => {
      subtotal += calcGroupSubtotal(system.items || []);
    });
  } else {
    subtotal = calcGroupSubtotal(doc.items || []);
  }
  const taxRate = Number(doc.taxRate || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
};

// ---------- layout constants ----------

const PAGE = { width: 210, height: 297 };
const MARGIN = 14;
const BRAND = { green: [45, 206, 137], teal: [17, 205, 239], dark: [10, 14, 26] };

// ---------- core renderer ----------

export async function generateDocumentPDF(doc, companySettings = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const { subtotal, taxAmount, total } = calcDocumentTotals(doc);

  const logo = await loadImageAsDataUrl(companySettings.logoUrl);

  let y = MARGIN;
  let page = 1;

  const checkPageBreak = (neededSpace) => {
    if (y + neededSpace > PAGE.height - MARGIN) {
      pdf.addPage();
      page += 1;
      y = MARGIN;
      drawContinuationHeader();
      return true;
    }
    return false;
  };

  const drawContinuationHeader = () => {
    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      `${doc.docTitle || doc.docType} ${doc.docNumber || ""} (cont'd)`,
      MARGIN,
      y
    );
    y += 8;
    if (doc.showUnitPrices) {
      drawTableHeader();
    }
  };

  const drawTableHeader = () => {
    pdf.setFillColor(...BRAND.dark);
    pdf.rect(MARGIN, y, PAGE.width - MARGIN * 2, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");

    if (doc.showUnitPrices) {
      pdf.text("#", MARGIN + 2, y + 5.5);
      pdf.text("Description", MARGIN + 10, y + 5.5);
      pdf.text("Qty", MARGIN + 100, y + 5.5);
      pdf.text("Unit Price", MARGIN + 120, y + 5.5);
      pdf.text("Disc%", MARGIN + 150, y + 5.5);
      pdf.text("Total", MARGIN + 170, y + 5.5);
    } else {
      pdf.text("#", MARGIN + 2, y + 5.5);
      pdf.text("Description", MARGIN + 10, y + 5.5);
      pdf.text("Qty", PAGE.width - MARGIN - 20, y + 5.5);
    }

    pdf.setFont(undefined, "normal");
    y += 10;
  };

  // ---- Title block ----
  const LOGO_SIZE = 18; // mm, square box
  let textStartX = MARGIN;

  if (logo) {
    const aspect = logo.width / logo.height;
    const drawW = aspect >= 1 ? LOGO_SIZE : LOGO_SIZE * aspect;
    const drawH = aspect >= 1 ? LOGO_SIZE / aspect : LOGO_SIZE;
    pdf.addImage(logo.dataUrl, "PNG", MARGIN, y - 2, drawW, drawH);
    textStartX = MARGIN + LOGO_SIZE + 6;
  }

  pdf.setFontSize(20);
  pdf.setTextColor(...BRAND.dark);
  pdf.setFont(undefined, "bold");
  pdf.text(companySettings.companyName || "Your Company", textStartX, y);
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  y += 6;
  if (companySettings.address) {
    pdf.text(companySettings.address, textStartX, y);
    y += 5;
  }
  if (companySettings.email) {
    pdf.text(companySettings.email, textStartX, y);
    y += 5;
  }
  if (companySettings.website) {
    pdf.text(companySettings.website, textStartX, y);
    y += 5;
  }
  // Make sure we clear the bottom of the logo box even if the company
  // text block above it was short (e.g. no address/website filled in).
  y = Math.max(y, MARGIN - 2 + LOGO_SIZE + 4);

  // doc type label, top right
  pdf.setFontSize(22);
  pdf.setTextColor(...BRAND.green);
  pdf.setFont(undefined, "bold");
  pdf.text((doc.docTitle || doc.docType || "DOCUMENT").toUpperCase(), PAGE.width - MARGIN, MARGIN + 8, {
    align: "right",
  });
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  pdf.text(`# ${doc.docNumber || ""}`, PAGE.width - MARGIN, MARGIN + 15, {
    align: "right",
  });
  pdf.text(`Issued: ${doc.issueDate || ""}`, PAGE.width - MARGIN, MARGIN + 20, {
    align: "right",
  });
  if (doc.docType === "invoice" && doc.dueDate) {
    pdf.text(`Due: ${doc.dueDate}`, PAGE.width - MARGIN, MARGIN + 25, {
      align: "right",
    });
  }
  if (doc.docType === "quote" && doc.validUntil) {
    pdf.text(`Valid until: ${doc.validUntil}`, PAGE.width - MARGIN, MARGIN + 25, {
      align: "right",
    });
  }
  if (doc.convertedFrom) {
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Converted from ${doc.convertedFrom}`, PAGE.width - MARGIN, MARGIN + 30, {
      align: "right",
    });
  }

  y += 8;

  // ---- Client block ----
  pdf.setDrawColor(...BRAND.green);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y, PAGE.width - MARGIN, y);
  y += 8;

  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.text("BILL TO", MARGIN, y);
  y += 5;
  pdf.setFontSize(11);
  pdf.setTextColor(...BRAND.dark);
  pdf.setFont(undefined, "bold");
  pdf.text(doc.clientName || "", MARGIN, y);
  pdf.setFont(undefined, "normal");
  y += 5;
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  if (doc.clientEmail) {
    pdf.text(doc.clientEmail, MARGIN, y);
    y += 5;
  }
  if (doc.clientAddress) {
    pdf.text(doc.clientAddress, MARGIN, y);
    y += 5;
  }

  y += 6;

  // ---- Items table ----
  const renderItemRow = (item, index) => {
    checkPageBreak(8);
    const lineTotal = calcLineTotal(item);

    pdf.setFontSize(9);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(String(index + 1), MARGIN + 2, y + 5);

    const descLines = pdf.splitTextToSize(
      item.name + (item.detail ? ` — ${item.detail}` : ""),
      doc.showUnitPrices ? 85 : PAGE.width - MARGIN * 2 - 40
    );
    pdf.text(descLines, MARGIN + 10, y + 5);
    const rowHeight = Math.max(8, descLines.length * 4.2);

    if (doc.showUnitPrices) {
      pdf.text(String(item.qty), MARGIN + 100, y + 5);
      pdf.text(fmtMoney(item.unitPrice, doc.currency), MARGIN + 120, y + 5);
      pdf.text(`${item.discount || 0}%`, MARGIN + 150, y + 5);
      pdf.text(fmtMoney(lineTotal, doc.currency), MARGIN + 170, y + 5);
    } else {
      pdf.text(String(item.qty), PAGE.width - MARGIN - 20, y + 5);
    }

    y += rowHeight + 2;
    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, y, PAGE.width - MARGIN, y);
    y += 3;
  };

  if (doc.useSystems && doc.systems?.length) {
    doc.systems.forEach((system) => {
      const visibleItems = (system.items || []).filter(hasItemContent);
      if (visibleItems.length === 0) return;

      checkPageBreak(14);
      pdf.setFontSize(11);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(...BRAND.teal);
      pdf.text(system.name || "System", MARGIN, y + 5);
      pdf.setFont(undefined, "normal");
      y += 9;

      if (doc.showUnitPrices) drawTableHeader();

      visibleItems.forEach((item, idx) => renderItemRow(item, idx));

      const groupSubtotal = calcGroupSubtotal(visibleItems);
      checkPageBreak(8);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(...BRAND.dark);
      pdf.text(
        `Subtotal (${system.name}): ${fmtMoney(groupSubtotal, doc.currency)}`,
        PAGE.width - MARGIN,
        y + 5,
        { align: "right" }
      );
      pdf.setFont(undefined, "normal");
      y += 10;
    });
  } else {
    const visibleItems = (doc.items || []).filter(hasItemContent);
    if (doc.showUnitPrices) drawTableHeader();
    visibleItems.forEach((item, idx) => renderItemRow(item, idx));
  }

  // ---- Totals ----
  checkPageBreak(35);
  y += 4;
  pdf.setDrawColor(...BRAND.green);
  pdf.line(PAGE.width - MARGIN - 70, y, PAGE.width - MARGIN, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text("Subtotal", PAGE.width - MARGIN - 70, y);
  pdf.text(fmtMoney(subtotal, doc.currency), PAGE.width - MARGIN, y, {
    align: "right",
  });
  y += 6;

  if (Number(doc.taxRate) > 0) {
    const label = doc.taxLabel?.trim() || "Tax";
    pdf.text(`${label} (${doc.taxRate}%)`, PAGE.width - MARGIN - 70, y);
    pdf.text(fmtMoney(taxAmount, doc.currency), PAGE.width - MARGIN, y, {
      align: "right",
    });
    y += 6;
  }

  pdf.setFontSize(13);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(...BRAND.green);
  pdf.text("TOTAL", PAGE.width - MARGIN - 70, y + 2);
  pdf.text(fmtMoney(total, doc.currency), PAGE.width - MARGIN, y + 2, {
    align: "right",
  });
  pdf.setFont(undefined, "normal");
  y += 14;

  // ---- Notes / Terms (text-only pages) ----
  const renderTextBlock = (label, content) => {
    if (!content) return;
    checkPageBreak(20);
    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(...BRAND.dark);
    pdf.text(label, MARGIN, y);
    y += 6;
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    const lines = pdf.splitTextToSize(content, PAGE.width - MARGIN * 2);
    lines.forEach((line) => {
      checkPageBreak(5);
      pdf.text(line, MARGIN, y);
      y += 5;
    });
    y += 6;
  };

  renderTextBlock("Notes", doc.notes);
  renderTextBlock("Terms & Conditions", doc.terms);

  // ---- Footer page numbers ----
  const totalPages = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${p} of ${totalPages}`, PAGE.width / 2, PAGE.height - 8, {
      align: "center",
    });
  }

  return pdf;
}

export async function downloadDocumentPDF(doc, companySettings, filename) {
  const pdf = await generateDocumentPDF(doc, companySettings);
  pdf.save(filename || `${doc.docType}-${doc.docNumber}.pdf`);
}

// Same PDF generation, but returns a Blob instead of triggering a browser
// download — used when the PDF needs to be attached to an email via the
// Gmail API rather than saved to the customer's Downloads folder.
export async function getDocumentPDFBlob(doc, companySettings) {
  const pdf = await generateDocumentPDF(doc, companySettings);
  return pdf.output("blob");
}

export { calcDocumentTotals, calcLineTotal, calcGroupSubtotal, fmtMoney };
