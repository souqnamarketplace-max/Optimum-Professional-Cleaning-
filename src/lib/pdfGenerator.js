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
    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(...BRAND.dark);
    pdf.text(companySettings.companyName || "", MARGIN, y);
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text(
      `${doc.docTitle || doc.docType} ${doc.docNumber || ""} — continued`,
      PAGE.width - MARGIN,
      y,
      { align: "right" }
    );
    y += 4;
    pdf.setDrawColor(225, 225, 225);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y, PAGE.width - MARGIN, y);
    y += 7;
    drawTableHeader();
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
  // Logo + company name are treated as one visual unit, vertically centered
  // on each other, rather than the logo's top edge lining up with the
  // company name's text baseline (which looked uneven — logo sat a bit
  // high/disconnected from the text block beside it).
  const LOGO_SIZE = 16; // mm, square box
  const headerTop = y;
  let textStartX = MARGIN;
  let textY = headerTop + 5; // company name baseline

  if (logo) {
    const aspect = logo.width / logo.height;
    const drawW = aspect >= 1 ? LOGO_SIZE : LOGO_SIZE * aspect;
    const drawH = aspect >= 1 ? LOGO_SIZE / aspect : LOGO_SIZE;
    // Center the logo vertically against the company-name line specifically,
    // not the whole text block, so it reads as paired with the name.
    pdf.addImage(logo.dataUrl, "PNG", MARGIN, textY - drawH / 2 - 1, drawW, drawH);
    textStartX = MARGIN + LOGO_SIZE + 5;
  }

  pdf.setFontSize(18);
  pdf.setTextColor(...BRAND.dark);
  pdf.setFont(undefined, "bold");
  pdf.text(companySettings.companyName || "Your Company", textStartX, textY);
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  let infoY = textY + 5.5;
  if (companySettings.address) {
    pdf.text(companySettings.address, textStartX, infoY);
    infoY += 4.6;
  }
  if (companySettings.email) {
    pdf.text(companySettings.email, textStartX, infoY);
    infoY += 4.6;
  }
  if (companySettings.website) {
    pdf.text(companySettings.website, textStartX, infoY);
    infoY += 4.6;
  }
  // Bottom of the left header column is whichever is taller: the company
  // text block, or the logo (logo top was textY - drawH/2, so its bottom
  // is textY + drawH/2).
  const logoBottom = logo
    ? textY + (logo.width / logo.height >= 1 ? LOGO_SIZE / (logo.width / logo.height) : LOGO_SIZE) / 2 + 1
    : headerTop;
  let leftColumnBottom = Math.max(infoY, logoBottom);

  // doc type label, top right — same headerTop baseline as the company
  // name so the two halves of the header read as a single aligned row.
  pdf.setFontSize(20);
  pdf.setTextColor(...BRAND.green);
  pdf.setFont(undefined, "bold");
  pdf.text((doc.docTitle || doc.docType || "DOCUMENT").toUpperCase(), PAGE.width - MARGIN, textY, {
    align: "right",
  });
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(90, 90, 90);
  let rightY = textY + 6.5;
  pdf.text(`#${doc.docNumber || ""}`, PAGE.width - MARGIN, rightY, { align: "right" });
  rightY += 4.6;
  pdf.text(`Issued ${doc.issueDate || ""}`, PAGE.width - MARGIN, rightY, { align: "right" });
  rightY += 4.6;
  if (doc.docType === "invoice" && doc.dueDate) {
    pdf.text(`Due ${doc.dueDate}`, PAGE.width - MARGIN, rightY, { align: "right" });
    rightY += 4.6;
  }
  if (doc.docType === "quote" && doc.validUntil) {
    pdf.text(`Valid until ${doc.validUntil}`, PAGE.width - MARGIN, rightY, { align: "right" });
    rightY += 4.6;
  }
  if (doc.convertedFrom) {
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Converted from ${doc.convertedFrom}`, PAGE.width - MARGIN, rightY, {
      align: "right",
    });
    rightY += 4.6;
  }

  y = Math.max(leftColumnBottom, rightY) + 5;

  // A single rule closes off the header as one cohesive block, instead of
  // company info and doc-type sitting in open space with no visual edge.
  pdf.setDrawColor(...BRAND.green);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, PAGE.width - MARGIN, y);
  y += 9;

  // ---- Client block ----
  pdf.setFontSize(8.5);
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

      drawTableHeader();

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
    drawTableHeader();
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

  // ---- Notes / Terms ----
  // Styled as a card with a colored accent bar and light fill, rather than
  // plain stacked text, so a multi-paragraph note or terms block reads as
  // a clearly separated, professional section instead of an afterthought.
  // The accent bar is drawn per text line (not as one tall rectangle) so
  // the styling stays correct even if the block spans a page break.
  const renderTextBlock = (label, content, accentColor) => {
    if (!content?.trim()) return;
    checkPageBreak(18);

    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(...BRAND.dark);
    pdf.text(label, MARGIN + 4, y);
    y += 6.5;

    pdf.setFont(undefined, "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);

    // Split on explicit newlines first (so distinct facts like "e-Transfer: ..."
    // and "Direct deposit: ..." land on their own lines), then wrap each of
    // those independently for width — otherwise splitTextToSize treats the
    // whole block as one paragraph and runs separate lines together.
    const paragraphs = content.trim().split("\n");
    const lines = paragraphs.flatMap((p) =>
      pdf.splitTextToSize(p, PAGE.width - MARGIN * 2 - 8)
    );

    lines.forEach((line) => {
      checkPageBreak(6);
      // Light fill + accent bar drawn fresh for each line so the card
      // visual survives a page break without needing to know the total
      // block height in advance.
      pdf.setFillColor(245, 247, 250);
      pdf.rect(MARGIN, y - 4, PAGE.width - MARGIN * 2, 6, "F");
      pdf.setFillColor(...accentColor);
      pdf.rect(MARGIN, y - 4, 1.2, 6, "F");
      pdf.setTextColor(90, 90, 90);
      pdf.text(line, MARGIN + 4, y);
      y += 5.2;
    });
    y += 7;
  };

  renderTextBlock("Notes", doc.notes, BRAND.teal);
  renderTextBlock("Terms & Conditions", doc.terms, BRAND.green);

  // ---- Payment Information ----
  // Built from whatever the company actually filled in on Settings — never
  // shows a labeled field with nothing next to it. If neither e-Transfer
  // nor bank details are set at all, the whole section is skipped rather
  // than appearing as an empty "Payment Information" header.
  const paymentLines = [];
  if (companySettings.etransferEmail?.trim()) {
    paymentLines.push(`e-Transfer: ${companySettings.etransferEmail.trim()}`);
  }
  const hasBankDetails =
    companySettings.bankInstitution?.trim() ||
    companySettings.bankTransit?.trim() ||
    companySettings.bankAccount?.trim();
  if (hasBankDetails) {
    const bankParts = [];
    if (companySettings.bankInstitution?.trim()) {
      bankParts.push(`Institution ${companySettings.bankInstitution.trim()}`);
    }
    if (companySettings.bankTransit?.trim()) {
      bankParts.push(`Transit ${companySettings.bankTransit.trim()}`);
    }
    if (companySettings.bankAccount?.trim()) {
      bankParts.push(`Account ${companySettings.bankAccount.trim()}`);
    }
    paymentLines.push(`Direct deposit: ${bankParts.join(" · ")}`);
  }
  if (paymentLines.length > 0) {
    renderTextBlock("Payment Information", paymentLines.join("\n"), BRAND.teal);
  }

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
