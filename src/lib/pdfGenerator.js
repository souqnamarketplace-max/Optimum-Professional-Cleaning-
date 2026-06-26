import jsPDF from "jspdf";

const COMPANY = {
  name: "Sounqin Technology Inc",
  tagline: "Innovative Technology Solutions",
  email: "admin@souqnin.com",
  website: "sn-technology-inc.vercel.app",
  address: "Alberta, Canada",
};

const C = {
  green:  [45, 206, 137],
  teal:   [17, 205, 239],
  dark:   [15, 23, 41],
  text:   [30, 30, 30],
  muted:  [110, 110, 110],
  light:  [240, 243, 248],
  subtle: [248, 250, 252],
  border: [220, 225, 235],
  white:  [255, 255, 255],
  detail: [120, 130, 150],
};

const PAGE_W   = 612;
const PAGE_H   = 792;
const ML       = 40;
const MR       = 40;
const COL_W    = PAGE_W - ML - MR;
const FOOTER_H = 65;
const SAFE_Y   = PAGE_H - FOOTER_H - 10;

async function imageToBase64(url) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise(res => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}

function drawFooter(pdf, pageNum, totalPages, terms) {
  const fy = PAGE_H - FOOTER_H;
  pdf.setFillColor(...C.green);
  pdf.rect(0, fy - 2, PAGE_W, 2, "F");
  pdf.setFillColor(...C.dark);
  pdf.rect(0, fy, PAGE_W, FOOTER_H + 5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...C.white);
  pdf.text("Thank you for your business!", PAGE_W / 2, fy + 12, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(180, 200, 220);
  pdf.text(`${COMPANY.name} — ${COMPANY.address}`, PAGE_W / 2, fy + 23, { align: "center" });
  pdf.text(`${COMPANY.email} • ${COMPANY.website}`, PAGE_W / 2, fy + 33, { align: "center" });
  if (terms) {
    const tl = pdf.splitTextToSize(terms, COL_W - 20);
    pdf.setFontSize(6.5);
    pdf.setTextColor(140, 160, 185);
    pdf.text(tl[0] + (tl.length > 1 ? "..." : ""), PAGE_W / 2, fy + 44, { align: "center" });
  }
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 160, 185);
  pdf.text(`Page ${pageNum} of ${totalPages}`, PAGE_W / 2, fy + 56, { align: "center" });
}

function drawContHeader(pdf) {
  pdf.setFillColor(...C.dark);
  pdf.rect(0, 0, PAGE_W, 48, "F");
  pdf.setFillColor(...C.green);
  pdf.rect(0, 48, PAGE_W, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...C.white);
  pdf.text(COMPANY.name, PAGE_W - MR, 26, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(180, 200, 220);
  pdf.text(COMPANY.email, PAGE_W - MR, 39, { align: "right" });
  return 62;
}

// Column positions
const COLS_SHOW = {
  no:    { x: ML,           label: "#"           },
  desc:  { x: ML + 26,      label: "DESCRIPTION" },
  qty:   { x: ML + 300,     label: "QTY"         },
  price: { x: ML + 365,     label: "UNIT PRICE"  },
  disc:  { x: ML + 450,     label: "DISC %"      },
  total: { x: ML + COL_W,   label: "TOTAL"       },
};

const COLS_HIDE = {
  no:    { x: ML,           label: "#"           },
  desc:  { x: ML + 26,      label: "DESCRIPTION" },
  qty:   { x: ML + COL_W,   label: "QTY"         }, // qty at far right, no total col
};

const DETAIL_INDENT  = ML + 30;
const DESC_MAX_W_SHOW = 255;
const DESC_MAX_W_HIDE = 460; // wider description when prices hidden

function drawTableHeader(pdf, y, showPrices, currency) {
  const cols = showPrices ? COLS_SHOW : COLS_HIDE;
  pdf.setFillColor(...C.dark);
  pdf.rect(ML, y, COL_W, 26, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...C.white);
  pdf.text("#",          cols.no.x + 4,   y + 17);
  pdf.text("DESCRIPTION", cols.desc.x + 4, y + 17);
  if (showPrices) {
    pdf.text("QTY",                COLS_SHOW.qty.x,   y + 17, { align: "right" });
    pdf.text(`UNIT (${currency})`, COLS_SHOW.price.x, y + 17, { align: "right" });
    pdf.text("DISC %",             COLS_SHOW.disc.x,  y + 17, { align: "right" });
    pdf.text(`TOTAL (${currency})`, COLS_SHOW.total.x, y + 17, { align: "right" });
  } else {
    pdf.text("QTY", COLS_HIDE.qty.x, y + 17, { align: "right" });
    // No TOTAL column header when prices hidden
  }
  return y + 26;
}

// Draw one item row — name on first line, detail below in smaller muted text
function drawItemRow(pdf, item, lineNum, isAlt, showPrices, y, newPage) {
  const cols     = showPrices ? COLS_SHOW : COLS_HIDE;
  const descMaxW = showPrices ? DESC_MAX_W_SHOW : DESC_MAX_W_HIDE;
  const name     = String(item.name || item.description || "");
  const detail   = String(item.detail || "");
  const qty      = parseFloat(item.quantity) || 1;
  const price    = parseFloat(item.price) || 0;
  const disc     = Math.min(100, Math.max(0, parseFloat(item.discount) || 0));
  const rowTotal = Math.round(qty * price * (1 - disc / 100) * 100) / 100;

  // Truncate name to one line — never let it overflow into numeric columns
  const nameLines = pdf.splitTextToSize(name, descMaxW);
  const nameLine  = nameLines[0] + (nameLines.length > 1 ? "..." : "");

  // Wrap detail text
  const detailLines = detail ? pdf.splitTextToSize(detail, descMaxW + 40) : [];
  const ROW_NAME_H   = 22;
  const ROW_DETAIL_H = detailLines.length * 11;
  const ROW_PAD      = detailLines.length > 0 ? 6 : 0;
  const rowH         = ROW_NAME_H + ROW_DETAIL_H + ROW_PAD;

  if (y + rowH > SAFE_Y) { y = newPage(); }

  // Row background
  if (isAlt) { pdf.setFillColor(...C.light); pdf.rect(ML, y, COL_W, rowH, "F"); }

  // Line number
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.setTextColor(...C.muted);
  pdf.text(String(lineNum), cols.no.x + 4, y + 15);

  // Item name (bold) — one line only, truncated
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  pdf.setTextColor(...C.text);
  pdf.text(nameLine, cols.desc.x + 4, y + 15);

  if (showPrices) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...C.text);
    pdf.text(String(qty), COLS_SHOW.qty.x, y + 15, { align: "right" });
    pdf.text(`$${price.toFixed(2)}`, COLS_SHOW.price.x, y + 15, { align: "right" });
    if (disc > 0) {
      pdf.setTextColor(251, 146, 60);
      pdf.text(`${disc}%`, COLS_SHOW.disc.x, y + 15, { align: "right" });
    } else {
      pdf.setTextColor(...C.muted);
      pdf.text("—", COLS_SHOW.disc.x, y + 15, { align: "right" });
    }
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...C.text);
    pdf.text(`$${rowTotal.toFixed(2)}`, cols.total.x, y + 15, { align: "right" });
  } else {
    // Prices OFF — show ONLY # | Description | Qty — NO total per line
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...C.text);
    pdf.text(String(qty), COLS_HIDE.qty.x, y + 15, { align: "right" });
  }

  // Detail line (italic, muted, smaller)
  if (detailLines.length > 0) {
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.5);
    pdf.setTextColor(...C.detail);
    detailLines.forEach((line, i) => {
      pdf.text(line, DETAIL_INDENT, y + ROW_NAME_H + (i * 11) + 2);
    });
  }

  return { y: y + rowH, lineNum: lineNum + 1 };
}

export async function generateDocumentPDF({ docType, data, logoUrl }) {
  const pdf        = new jsPDF({ unit: "pt", format: "letter" });
  const titleMap   = { quote: "QUOTATION", invoice: "INVOICE", receipt: "RECEIPT" };
  const title      = titleMap[docType] || docType.toUpperCase();
  const showPrices = data.show_unit_prices !== false;
  const hasSystems = data.use_systems && data.systems?.length > 0;
  const currency   = data.currency || "CAD";
  const terms      = data.terms || "";

  const logoBase64 = logoUrl ? await imageToBase64(logoUrl) : null;

  // ── PAGE 1 HEADER ──────────────────────────────────────────────────────────
  const HEADER_H = 128;
  pdf.setFillColor(...C.dark);
  pdf.rect(0, 0, PAGE_W, HEADER_H, "F");
  pdf.setFillColor(...C.green);
  pdf.rect(0, HEADER_H, PAGE_W, 3, "F");

  if (logoBase64) {
    try { pdf.addImage(logoBase64, "PNG", ML, 26, 65, 65); } catch {}
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(...C.white);
  pdf.text(COMPANY.name, PAGE_W - MR, 46, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(180, 200, 220);
  pdf.text(COMPANY.tagline, PAGE_W - MR, 61, { align: "right" });
  pdf.text(COMPANY.email,   PAGE_W - MR, 76, { align: "right" });
  pdf.text(COMPANY.website, PAGE_W - MR, 90, { align: "right" });

  // ── DOC TITLE ─────────────────────────────────────────────────────────────
  let y = HEADER_H + 28;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(...C.text);
  pdf.text(title, ML, y);

  if (data.doc_title?.trim()) {
    y += 16;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...C.muted);
    pdf.text(data.doc_title, ML, y);
  }

  // Meta right
  let metaY = HEADER_H + 28;
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...C.muted);
  pdf.text(`# ${data.doc_number}`, PAGE_W - MR, metaY - 12, { align: "right" });

  const metaRows = [
    ["Date:", data.issue_date || ""],
    data.due_date && docType !== "receipt" ? ["Due:", data.due_date] : null,
    data.valid_until && docType === "quote" ? ["Valid Until:", data.valid_until] : null,
    ["Currency:", currency],
  ].filter(Boolean);

  metaRows.forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...C.text);
    pdf.text(label, PAGE_W - MR - 80, metaY, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.text(value, PAGE_W - MR, metaY, { align: "right" });
    metaY += 14;
  });

  // ── BILL TO ────────────────────────────────────────────────────────────────
  y += 32;
  pdf.setFontSize(8); pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...C.muted);
  pdf.text(docType === "receipt" ? "RECEIVED FROM" : "BILL TO", ML, y);
  y += 14;
  pdf.setFontSize(12); pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...C.text);
  pdf.text(data.client_name, ML, y);
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...C.muted);
  if (data.client_email)   { y += 13; pdf.text(data.client_email, ML, y); }
  if (data.client_address) { y += 13; pdf.text(data.client_address, ML, y); }

  // ── TABLE ──────────────────────────────────────────────────────────────────
  y += 26;
  let pageNum = 1;
  let lineNum = 1;

  // newPage for TABLE content — shows continuation header + table header
  const newPage = () => {
    drawFooter(pdf, pageNum, "?", terms);
    pdf.addPage();
    pageNum++;
    let ny = drawContHeader(pdf);
    ny = drawTableHeader(pdf, ny, showPrices, currency);
    return ny;
  };

  // newPage for TEXT content (notes/terms) — shows continuation header only, NO table header
  const newTextPage = () => {
    drawFooter(pdf, pageNum, "?", terms);
    pdf.addPage();
    pageNum++;
    let ny = drawContHeader(pdf);
    return ny;
  };

  y = drawTableHeader(pdf, y, showPrices, currency);

  if (hasSystems) {
    for (const sys of data.systems) {
      const sysTotal = (sys.items || []).reduce((s, i) => {
        const d = Math.min(100, Math.max(0, parseFloat(i.discount) || 0));
        return s + (parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0) * (1 - d / 100);
      }, 0);

      // System header row
      if (y + 24 > SAFE_Y) y = newPage();
      pdf.setFillColor(17, 40, 80);
      pdf.rect(ML, y, COL_W, 22, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
      pdf.setTextColor(...C.teal);
      pdf.text(`▶  ${sys.name.toUpperCase()}`, ML + 8, y + 15);
      y += 22;

      if (showPrices) {
        for (const item of (sys.items || [])) {
          const result = drawItemRow(pdf, item, lineNum, lineNum % 2 === 1, showPrices, y, newPage);
          y = result.y; lineNum = result.lineNum;
        }
      }

      // System total — always shown at right edge regardless of price mode
      if (y + 22 > SAFE_Y) y = newPage();
      pdf.setFillColor(20, 50, 90);
      pdf.rect(ML, y, COL_W, 22, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
      pdf.setTextColor(...C.green);
      pdf.text(`${sys.name} — Total`, ML + 8, y + 15);
      pdf.text(`$${sysTotal.toFixed(2)}`, ML + COL_W, y + 15, { align: "right" });
      y += 22;
    }
  } else {
    for (const item of (data.items || [])) {
      const result = drawItemRow(pdf, item, lineNum, lineNum % 2 === 1, showPrices, y, newPage);
      y = result.y; lineNum = result.lineNum;
    }
  }

  // ── TOTALS — always recalculate from items to ensure discount is applied ───
  const allItemsForTotal = hasSystems
    ? (data.systems || []).flatMap(s => s.items || [])
    : (data.items || []);

  const recalcSubtotal = allItemsForTotal.reduce((s, i) => {
    const qty  = parseFloat(i.quantity) || 1;
    const price= parseFloat(i.price) || 0;
    const disc = Math.min(100, Math.max(0, parseFloat(i.discount) || 0));
    return s + qty * price * (1 - disc / 100);
  }, 0);
  const taxRate = parseFloat(data.tax_rate) || 0;
  const recalcTax = (recalcSubtotal * taxRate) / 100;
  const recalcTotal = recalcSubtotal + recalcTax;

  const totH = taxRate > 0 ? 110 : 85;
  if (y + totH > SAFE_Y) y = newTextPage();
  y += 16;
  const totX = PAGE_W - MR - 210;
  const totalColX = COLS_SHOW.total.x;

  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  pdf.setTextColor(...C.muted);
  pdf.text("Subtotal:", totX, y);
  pdf.setTextColor(...C.text);
  pdf.text(`$${recalcSubtotal.toFixed(2)}`, totalColX, y, { align: "right" });

  if (taxRate > 0) {
    y += 16;
    pdf.setTextColor(...C.muted);
    pdf.text(`Tax (${taxRate}%):`, totX, y);
    pdf.setTextColor(...C.text);
    pdf.text(`$${recalcTax.toFixed(2)}`, totalColX, y, { align: "right" });
  }

  y += 8;
  pdf.setDrawColor(...C.border);
  pdf.line(totX, y, totalColX, y);
  y += 20;

  pdf.setFillColor(...C.green);
  pdf.rect(totX - 8, y - 14, totalColX - totX + 18, 28, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
  pdf.setTextColor(...C.white);
  pdf.text(`TOTAL (${currency}):`, totX, y + 3);
  pdf.text(`$${recalcTotal.toFixed(2)}`, totalColX, y + 3, { align: "right" });

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (data.notes?.trim()) {
    y += 36;
    if (y + 50 > SAFE_Y) y = newTextPage();
    pdf.setFontSize(8); pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...C.muted);
    pdf.text("NOTES", ML, y);
    y += 13;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5);
    pdf.setTextColor(...C.text);
    for (const line of pdf.splitTextToSize(data.notes, COL_W)) {
      if (y + 13 > SAFE_Y) y = newTextPage();
      pdf.text(line, ML, y); y += 13;
    }
  }

  // ── TERMS ─────────────────────────────────────────────────────────────────
  if (data.terms?.trim()) {
    y += 24;
    if (y + 50 > SAFE_Y) y = newTextPage();
    pdf.setFontSize(8); pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...C.muted);
    pdf.text("TERMS & CONDITIONS", ML, y);
    y += 13;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
    pdf.setTextColor(...C.muted);
    for (const line of pdf.splitTextToSize(data.terms, COL_W)) {
      if (y + 12 > SAFE_Y) y = newTextPage();
      pdf.text(line, ML, y); y += 12;
    }
  }

  // ── FOOTERS ────────────────────────────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawFooter(pdf, p, totalPages, terms);
  }

  const slug = data.client_name.replace(/\s+/g, "_").slice(0, 30);
  pdf.save(`${title}_${data.doc_number}_${slug}.pdf`);
}
