import jsPDF from "jspdf";

// ---------- helpers ----------

const fmtMoney = (n, currency = "USD") => {
  const symbols = { USD: "$", CAD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || "";
  const val = Number(n || 0).toFixed(2);
  return `${symbol}${val}`;
};

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

export function generateDocumentPDF(doc, companySettings = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const { subtotal, taxAmount, total } = calcDocumentTotals(doc);

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
  pdf.setFontSize(20);
  pdf.setTextColor(...BRAND.dark);
  pdf.setFont(undefined, "bold");
  pdf.text(companySettings.companyName || "Your Company", MARGIN, y);
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  y += 6;
  if (companySettings.address) {
    pdf.text(companySettings.address, MARGIN, y);
    y += 5;
  }
  if (companySettings.email) {
    pdf.text(companySettings.email, MARGIN, y);
    y += 5;
  }
  if (companySettings.website) {
    pdf.text(companySettings.website, MARGIN, y);
    y += 5;
  }

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
      checkPageBreak(14);
      pdf.setFontSize(11);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(...BRAND.teal);
      pdf.text(system.name || "System", MARGIN, y + 5);
      pdf.setFont(undefined, "normal");
      y += 9;

      if (doc.showUnitPrices) drawTableHeader();

      (system.items || []).forEach((item, idx) => renderItemRow(item, idx));

      const groupSubtotal = calcGroupSubtotal(system.items || []);
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
    if (doc.showUnitPrices) drawTableHeader();
    (doc.items || []).forEach((item, idx) => renderItemRow(item, idx));
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
    pdf.text(`Tax (${doc.taxRate}%)`, PAGE.width - MARGIN - 70, y);
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

export function downloadDocumentPDF(doc, companySettings, filename) {
  const pdf = generateDocumentPDF(doc, companySettings);
  pdf.save(filename || `${doc.docType}-${doc.docNumber}.pdf`);
}

export { calcDocumentTotals, calcLineTotal, calcGroupSubtotal, fmtMoney };
