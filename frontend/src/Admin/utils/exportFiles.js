// Professional file exports for the admin: Sales report as PDF and Excel, order receipt as PDF.
// The libraries are big, so they are imported only when a download button is clicked — the rest of
// the admin panel does not get slower because of them.
//
// PDF text uses the built-in Helvetica font, which only knows basic Latin characters. So every string
// here is plain ASCII: "Rs 1,234" (not the Intl output, which can contain a special space), "-" not "−".

const BRAND = [63, 74, 201];      // #3F4AC9, same as --sz-primary-strong
const INK = [27, 31, 42];
const MUTED = [107, 114, 128];
const LINE = [227, 229, 236];
const SOFT = [243, 244, 250];
const RED = [180, 35, 42];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
export const rs = (v) => { const x = Number(v) || 0; return `${x < 0 ? "-" : ""}Rs ${n0(Math.abs(x))}`; };
const pctText = (x) => `${Math.round(x * 100)}%`;

// "2026-09-27" or a Date -> "27 Sep 2026"
export const niceDate = (v) => {
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10))
    : new Date(v);
  return isNaN(d) ? "-" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const niceDateTime = (d) => `${niceDate(d)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// Short period label, ASCII only. Same wording as the screen table.
export const periodText = (row, groupBy) => {
  const s = new Date(+row.start.slice(0, 4), +row.start.slice(5, 7) - 1, +row.start.slice(8, 10));
  const e = new Date(+row.end.slice(0, 4), +row.end.slice(5, 7) - 1, +row.end.slice(8, 10));
  if (groupBy === "year") return String(s.getFullYear());
  if (groupBy === "month") return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  if (groupBy === "week" && row.start !== row.end) return `${s.getDate()} ${MONTHS[s.getMonth()]} - ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
};

const growthText = (cur, prev) => {
  if (!prev) return "No data for the previous period";
  const g = (cur - prev) / Math.abs(prev);
  return `${g >= 0 ? "+" : "-"}${pctText(Math.abs(g))} vs previous period`;
};

const GROUP_WORD = { day: "day", week: "week", month: "month", year: "year" };

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the download start before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadPdf() {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { jsPDF, autoTable: autoTableMod.default || autoTableMod.autoTable };
}

// Brand bar at the top of every PDF.
function pdfHeader(doc, title, right) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ShopZinc", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(title, W - 14, 10, { align: "right" });
  if (right) {
    doc.setFontSize(9);
    doc.text(right, W - 14, 16, { align: "right" });
  }
}

// "ShopZinc - <what> - Page x of y" on every page, drawn at the end when the page count is known.
function pdfFooters(doc, what) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(14, H - 14, W - 14, H - 14);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(`ShopZinc - ${what}`, 14, H - 9);
    doc.text(`Page ${i} of ${pages}`, W - 14, H - 9, { align: "right" });
  }
}

// ======================================================================
// Sales report -> PDF
// ======================================================================
// report: the /reports/sales response. meta: { generatedBy }
export async function downloadReportPdf(report, meta = {}) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const now = new Date();
  const t = report.totals, prev = report.previous;
  const hasProfit = t.profitCoverage > 0;

  pdfHeader(doc, "Sales report", `${niceDate(report.from)} - ${niceDate(report.to)}`);

  // ---- title + details
  let y = 34;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Sales & profit report", 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`Period: ${niceDate(report.from)} to ${niceDate(report.to)}   |   Grouped by ${GROUP_WORD[report.groupBy]}   |   Generated ${niceDateTime(now)}${meta.generatedBy ? ` by ${meta.generatedBy}` : ""}`, 14, y);

  // ---- summary boxes
  y += 8;
  const boxes = [
    { label: "Sales", value: rs(t.revenue), note: growthText(t.revenue, prev.revenue) },
    {
      label: t.profit < 0 ? "Loss" : "Profit",
      value: hasProfit ? rs(t.profit) : "-",
      note: hasProfit ? `${t.margin !== null ? `${pctText(t.margin)} margin` : ""}${t.profitCoverage < 1 ? ` (covers ${pctText(t.profitCoverage)} of sales)` : ""}` : "No cost prices yet",
      color: hasProfit && t.profit < 0 ? RED : INK,
    },
    { label: "Orders", value: n0(t.orders), note: growthText(t.orders, prev.orders) },
    { label: "Average order", value: rs(t.avgOrder), note: `${n0(t.itemsSold)} items sold` },
  ];
  const gap = 4, bw = (W - 28 - gap * 3) / 4, bh = 26;
  boxes.forEach((b, i) => {
    const x = 14 + i * (bw + gap);
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, y, bw, bh, 2, 2, "FD");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(b.label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...(b.color || INK));
    doc.text(b.value, x + 4, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(b.note, bw - 8).slice(0, 2), x + 4, y + 19.5);
  });
  y += bh + 6;

  // ---- notes
  const notes = [];
  if (hasProfit && t.profitCoverage < 1) notes.push(`Profit counts only products that had a cost price when sold (${pctText(t.profitCoverage)} of sales).`);
  if (!hasProfit) notes.push("Profit is not shown: none of the sold products had a cost price at the time of sale.");
  if (t.cancelled) notes.push(`${t.cancelled} cancelled order${t.cancelled === 1 ? " is" : "s are"} not included in sales.`);
  if (notes.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    notes.forEach((line) => { doc.text(`- ${line}`, 14, y); y += 4.5; });
    y += 2;
  }

  // ---- sales bar chart (drawn with plain shapes; skipped when there are too many bars to read)
  const series = report.series;
  if (series.length <= 62 && series.some((r) => r.revenue > 0)) {
    const ch = 48, cw = W - 28, left = 14 + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Sales by ${GROUP_WORD[report.groupBy]} (Rs)`, 14, y + 4);
    const top = y + 9, plotW = cw - 20;
    const max = Math.max(...series.map((r) => r.revenue));
    // Clean top value (1, 2, 2.5 or 5 x 10^n) so the axis reads well.
    const mag = Math.pow(10, Math.floor(Math.log10(max || 1)));
    const niceMax = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= max) || max;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (let i = 0; i <= 4; i++) {
      const v = (niceMax / 4) * i, ly = top + ch - (ch * i) / 4;
      doc.setDrawColor(...LINE);
      doc.line(left, ly, left + plotW, ly);
      doc.setTextColor(...MUTED);
      doc.text(rs(v).replace("Rs ", ""), left - 2, ly + 1, { align: "right" });
    }
    const band = plotW / series.length, barW = Math.min(8, band * 0.65);
    doc.setFillColor(...BRAND);
    series.forEach((r, i) => {
      if (r.revenue <= 0) return;
      const h = (r.revenue / niceMax) * ch;
      doc.rect(left + i * band + (band - barW) / 2, top + ch - h, barW, h, "F");
    });
    // A few x labels only, so they never overlap.
    const every = Math.max(1, Math.ceil(series.length / 8));
    doc.setTextColor(...MUTED);
    series.forEach((r, i) => {
      if (i % every !== 0 && i !== series.length - 1) return;
      if (i !== series.length - 1 && series.length - 1 - i < every) return;
      // Year dropped on the axis to keep labels short; the table below has full dates.
      const label = periodText(r, report.groupBy).replace(/ \d{4}$/, "");
      doc.text(label, left + i * band + band / 2, top + ch + 4, { align: "center" });
    });
    y = top + ch + 10;
  }

  // ---- period table
  const money = (v) => rs(v);
  // Only periods with orders: 25 rows of "Rs 0" hide the numbers that matter. Excel keeps every row.
  const active = series.filter((r) => r.orders > 0 || r.cancelled > 0);
  const hidden = series.length - active.length;
  if (hidden > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(active.length
      ? `${hidden} ${GROUP_WORD[report.groupBy]}${hidden === 1 ? "" : "s"} with no orders ${hidden === 1 ? "is" : "are"} not listed.`
      : `No orders in this period.`, 14, y);
    y += 4;
  }
  autoTable(doc, {
    startY: y,
    head: [["Period", "Orders", "Items", "Sales", "Cost", "Profit / loss"]],
    body: active.map((r) => [
      periodText(r, report.groupBy),
      n0(r.orders),
      n0(r.itemsSold),
      money(r.revenue),
      r.cost ? money(r.cost) : "-",
      r.profitCoverage > 0 ? money(r.profit) : "-",
    ]),
    foot: [["Total", n0(t.orders), n0(t.itemsSold), money(t.revenue), t.cost ? money(t.cost) : "-", hasProfit ? money(t.profit) : "-"]],
    // Total once, at the end — not repeated at the bottom of every page.
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: SOFT, textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    didParseCell: (data) => {
      // Numbers right-aligned in the header too; losses in red.
      if ((data.section === "head" || data.section === "foot") && data.column.index > 0) data.cell.styles.halign = "right";
      if (data.column.index === 5 && data.section !== "head") {
        const row = data.section === "foot" ? null : active[data.row.index];
        const raw = row ? row.profit : t.profit;
        if (raw < 0 && (row ? row.profitCoverage > 0 : hasProfit)) data.cell.styles.textColor = RED;
      }
    },
    margin: { left: 14, right: 14, top: 28, bottom: 20 },
    didDrawPage: (data) => { if (data.pageNumber > 1) pdfHeader(doc, "Sales report", `${niceDate(report.from)} - ${niceDate(report.to)}`); },
  });

  // ---- top products
  if (report.topProducts.length) {
    let ty = doc.lastAutoTable.finalY + 10;
    if (ty > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); pdfHeader(doc, "Sales report", `${niceDate(report.from)} - ${niceDate(report.to)}`); ty = 32; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Top products", 14, ty);
    autoTable(doc, {
      startY: ty + 3,
      head: [["#", "Product", "Units sold", "Sales"]],
      body: report.topProducts.map((p, i) => [String(i + 1), p.name.replace(/[^\x20-\x7E]/g, "?"), n0(p.quantity), money(p.revenue)]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 10, halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: (data) => { if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right"; },
      margin: { left: 14, right: 14, top: 28, bottom: 20 },
    });
  }

  pdfFooters(doc, `Sales report ${niceDate(report.from)} - ${niceDate(report.to)}`);
  doc.save(`ShopZinc-Sales-Report_${report.from}_to_${report.to}.pdf`);
}

// ======================================================================
// Sales report -> Excel (.xlsx)
// ======================================================================
export async function downloadReportXlsx(report, meta = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ShopZinc";
  wb.created = new Date();
  // Excel recalculates the SUM() totals when the file opens, so they are never blank or stale.
  wb.calcProperties.fullCalcOnLoad = true;
  const t = report.totals, prev = report.previous;
  const hasProfit = t.profitCoverage > 0;

  const MONEY = '"Rs" #,##0;[Red]-"Rs" #,##0';
  const INT = "#,##0";
  const PCT = "0%";
  const brandFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3F4AC9" } };
  const softFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4FA" } };
  const thin = { style: "thin", color: { argb: "FFE3E5EC" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  // Title block shared by every sheet.
  const titleBlock = (ws, title, cols) => {
    ws.mergeCells(1, 1, 1, cols);
    const c = ws.getCell(1, 1);
    c.value = `ShopZinc - ${title}`;
    c.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    c.fill = brandFill;
    c.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, cols);
    const d = ws.getCell(2, 1);
    d.value = `Period: ${niceDate(report.from)} to ${niceDate(report.to)}  |  Grouped by ${GROUP_WORD[report.groupBy]}  |  Generated ${niceDateTime(new Date())}${meta.generatedBy ? ` by ${meta.generatedBy}` : ""}`;
    d.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    ws.getRow(3).height = 8;
  };
  const headerRow = (row) => {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = brandFill;
      cell.border = box;
      cell.alignment = { vertical: "middle" };
    });
    row.height = 20;
  };

  // ---- Summary sheet
  const s = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 28 }, { width: 20 }, { width: 20 }, { width: 16 }];
  titleBlock(s, "Sales report", 4);
  headerRow(s.addRow(["Measure", "This period", "Previous period", "Change"]));
  const change = (cur, p) => (p ? (cur - p) / Math.abs(p) : null);
  const rows = [
    ["Sales", t.revenue, prev.revenue, change(t.revenue, prev.revenue), MONEY],
    ["Orders", t.orders, prev.orders, change(t.orders, prev.orders), INT],
    ["Average order value", t.avgOrder, prev.avgOrder, change(t.avgOrder, prev.avgOrder), MONEY],
    ["Items sold", t.itemsSold, prev.itemsSold, change(t.itemsSold, prev.itemsSold), INT],
    ["Cost of goods sold", hasProfit ? t.cost : null, prev.profitCoverage > 0 ? prev.cost : null, null, MONEY],
    ["Profit / loss", hasProfit ? t.profit : null, prev.profitCoverage > 0 ? prev.profit : null, hasProfit && prev.profitCoverage > 0 ? change(t.profit, prev.profit) : null, MONEY],
    ["Profit margin", t.margin, prev.margin, null, PCT],
    ["Share of sales with a cost price", t.profitCoverage, prev.profitCoverage, null, PCT],
    ["Paid sales", t.paidRevenue, prev.paidRevenue, change(t.paidRevenue, prev.paidRevenue), MONEY],
    ["Cancelled orders (not in sales)", t.cancelled, prev.cancelled, null, INT],
  ];
  rows.forEach(([label, cur, p, ch, fmt], i) => {
    const r = s.addRow([label, cur ?? "-", p ?? "-", ch ?? "-"]);
    r.getCell(1).font = { bold: true };
    [2, 3].forEach((k) => { if (typeof r.getCell(k).value === "number") r.getCell(k).numFmt = fmt; });
    if (typeof ch === "number") r.getCell(4).numFmt = '+0%;[Red]-0%;0%';
    [2, 3, 4].forEach((k) => { r.getCell(k).alignment = { horizontal: "right" }; });
    r.eachCell((cell) => { cell.border = box; if (i % 2 === 1) cell.fill = softFill; });
  });
  s.addRow([]);
  const note = s.addRow(["Profit only counts products that had a cost price when they were sold."]);
  s.mergeCells(note.number, 1, note.number, 4);
  note.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  // ---- By period sheet
  const p = wb.addWorksheet(`By ${GROUP_WORD[report.groupBy]}`, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  p.columns = [{ width: 26 }, { width: 13 }, { width: 13 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
  titleBlock(p, `Sales by ${GROUP_WORD[report.groupBy]}`, 9);
  headerRow(p.addRow(["Period", "From", "To", "Orders", "Items", "Sales", "Cost", "Profit / loss", "Cancelled"]));
  const first = p.rowCount + 1;
  const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  report.series.forEach((r, i) => {
    const row = p.addRow([
      periodText(r, report.groupBy), toDate(r.start), toDate(r.end), r.orders, r.itemsSold, r.revenue,
      r.cost || null, r.profitCoverage > 0 ? r.profit : null, r.cancelled,
    ]);
    row.getCell(2).numFmt = "dd mmm yyyy";
    row.getCell(3).numFmt = "dd mmm yyyy";
    [4, 5, 9].forEach((k) => { row.getCell(k).numFmt = INT; });
    [6, 7, 8].forEach((k) => { row.getCell(k).numFmt = MONEY; });
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = box; if (i % 2 === 1) cell.fill = softFill; });
    if (r.orders === 0) row.font = { color: { argb: "FF9CA3AF" } };
  });
  const last = p.rowCount;
  // Real formulas in the total row, so the sheet stays right if someone edits a number.
  const sum = (col, result) => (last >= first ? { formula: `SUM(${col}${first}:${col}${last})`, result } : result);
  const total = p.addRow([
    "Total", null, null, sum("D", t.orders), sum("E", t.itemsSold), sum("F", t.revenue),
    hasProfit ? sum("G", t.cost) : null, hasProfit ? sum("H", t.profit) : null, sum("I", t.cancelled),
  ]);
  total.font = { bold: true };
  [4, 5, 9].forEach((k) => { total.getCell(k).numFmt = INT; });
  [6, 7, 8].forEach((k) => { total.getCell(k).numFmt = MONEY; });
  total.eachCell({ includeEmpty: true }, (cell) => { cell.border = { ...box, top: { style: "medium", color: { argb: "FF1B1F2A" } } }; cell.fill = softFill; });
  p.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: 9 } };

  // ---- Top products sheet
  const tp = wb.addWorksheet("Top products", { views: [{ showGridLines: false }] });
  tp.columns = [{ width: 6 }, { width: 40 }, { width: 14 }, { width: 18 }];
  titleBlock(tp, "Top products", 4);
  headerRow(tp.addRow(["#", "Product", "Units sold", "Sales"]));
  report.topProducts.forEach((prod, i) => {
    const r = tp.addRow([i + 1, prod.name, prod.quantity, prod.revenue]);
    r.getCell(3).numFmt = INT;
    r.getCell(4).numFmt = MONEY;
    r.getCell(1).alignment = { horizontal: "center" };
    r.eachCell((cell) => { cell.border = box; if (i % 2 === 1) cell.fill = softFill; });
  });
  if (!report.topProducts.length) tp.addRow(["", "No products sold in this period."]);

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `ShopZinc-Sales-Report_${report.from}_to_${report.to}.xlsx`);
}

// ======================================================================
// Order receipt -> PDF
// ======================================================================
// order: the /reports/receipt/:orderId response. labels: { number, status, method, payStatus }
export async function downloadReceiptPdf(order, labels) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const ascii = (s) => String(s ?? "").replace(/[^\x20-\x7E]/g, "?");

  pdfHeader(doc, "Order receipt", `Receipt #${labels.number}`);

  // ---- receipt details (right) + title (left)
  let y = 36;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Receipt", 14, y);
  const meta = [["Receipt no.", `#${labels.number}`], ["Date", niceDate(order.orderDate || order.createdAt)], ["Order status", labels.status]];
  doc.setFontSize(9.5);
  meta.forEach(([k, v], i) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(k, W - 60, y - 6 + i * 5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(ascii(v), W - 14, y - 6 + i * 5.5, { align: "right" });
  });

  // ---- three columns: billed to / ship to / payment
  y += 18;
  doc.setDrawColor(...LINE);
  doc.line(14, y - 6, W - 14, y - 6);
  const a = order.shippingAddress || {};
  const colW = (W - 28) / 3;
  const cols = [
    ["BILLED TO", [order.user?.name || "Customer", order.user?.email || ""]],
    ["SHIP TO", [a.street, [a.city, a.state].filter(Boolean).join(", "), [a.postalCode, a.country].filter(Boolean).join(" ")].filter(Boolean)],
    ["PAYMENT", [labels.method, labels.payStatus, order.payment?.transactionId ? `Ref: ${order.payment.transactionId}` : ""]],
  ];
  let maxLines = 0;
  cols.forEach(([head, lines], i) => {
    const x = 14 + i * colW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(head, x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const wrapped = lines.filter(Boolean).flatMap((l) => doc.splitTextToSize(ascii(l), colW - 4));
    doc.text(wrapped.length ? wrapped : ["-"], x, y + 5.5);
    maxLines = Math.max(maxLines, wrapped.length || 1);
  });
  y += 7 + maxLines * 4.5;

  // ---- items
  const items = order.items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.priceAtTimeOfOrder) || 0) * (Number(it.quantity) || 0), 0);
  autoTable(doc, {
    startY: y,
    head: [["Item", "Qty", "Unit price", "Amount"]],
    body: items.map((it) => {
      const choices = (it.selected || []).map((s) => `${s.name}: ${s.value}`).join(", ");
      const name = ascii(it.product?.name || "Deleted product");
      return [
        choices ? `${name}\n${ascii(choices)}` : name,
        n0(it.quantity),
        rs(it.priceAtTimeOfOrder),
        rs((Number(it.priceAtTimeOfOrder) || 0) * (Number(it.quantity) || 0)),
      ];
    }),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.6, lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 16 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 34 } },
    didParseCell: (data) => { if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right"; },
    margin: { left: 14, right: 14, top: 28, bottom: 20 },
  });

  // ---- totals (right)
  let ty = doc.lastAutoTable.finalY + 8;
  if (ty > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); pdfHeader(doc, "Order receipt", `Receipt #${labels.number}`); ty = 34; }
  const other = Math.round((Number(order.totalAmount) || 0) - subtotal);
  const lines = [["Subtotal", rs(subtotal)]];
  if (other !== 0) lines.push(["Other charges", rs(other)]);
  doc.setFontSize(9.5);
  lines.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(k, W - 80, ty);
    doc.setTextColor(...INK);
    doc.text(v, W - 14, ty, { align: "right" });
    ty += 6;
  });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(W - 80, ty - 2, W - 14, ty - 2);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", W - 80, ty + 4);
  doc.text(rs(order.totalAmount), W - 14, ty + 4, { align: "right" });

  // ---- thank-you line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Thank you for shopping with ShopZinc.", W / 2, ty + 22, { align: "center" });

  pdfFooters(doc, `Receipt #${labels.number}`);
  doc.save(`ShopZinc-Receipt_${labels.number}_${stamp(new Date(order.orderDate || order.createdAt || Date.now()))}.pdf`);
}
