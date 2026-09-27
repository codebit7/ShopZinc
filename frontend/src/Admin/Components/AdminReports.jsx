import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiDownload, FiFileText, FiArrowUpRight, FiArrowDownRight, FiInfo } from "react-icons/fi";
import { useSelector } from "react-redux";
import { downloadReportPdf, downloadReportXlsx } from "../utils/exportFiles";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import "./../Styles/reports.css";

// Sales & profit report. The server does all the money math (backend utils/report.js); this page
// only picks the filters, draws and exports. Filters live in the URL so a refresh keeps them.

// ---------- dates (the admin's local calendar) ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

const PRESETS = [
  { id: "7d", label: "Last 7 days", group: "day", range: (t) => [addDays(t, -6), t] },
  { id: "30d", label: "Last 30 days", group: "day", range: (t) => [addDays(t, -29), t] },
  { id: "month", label: "This month", group: "day", range: (t) => [new Date(t.getFullYear(), t.getMonth(), 1), t] },
  { id: "lastmonth", label: "Last month", group: "day", range: (t) => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)] },
  { id: "3m", label: "Last 3 months", group: "week", range: (t) => [new Date(t.getFullYear(), t.getMonth() - 2, 1), t] },
  { id: "year", label: "This year", group: "month", range: (t) => [new Date(t.getFullYear(), 0, 1), t] },
  { id: "lastyear", label: "Last year", group: "month", range: (t) => [new Date(t.getFullYear() - 1, 0, 1), new Date(t.getFullYear() - 1, 11, 31)] },
  { id: "all", label: "Last 5 years", group: "year", range: (t) => [new Date(t.getFullYear() - 4, 0, 1), t] },
  { id: "custom", label: "Custom range", group: null, range: null },
];
const GROUPS = [["day", "Days"], ["week", "Weeks"], ["month", "Months"], ["year", "Years"]];

const monthDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

// Short label for one bar / table row.
const periodLabel = (row, groupBy) => {
  const s = parseYmd(row.start), e = parseYmd(row.end);
  if (groupBy === "year") return String(s.getFullYear());
  if (groupBy === "month") return monthYear.format(s);
  if (groupBy === "week") return row.start === row.end ? monthDay.format(s) : `${monthDay.format(s)} – ${monthDay.format(e)}`;
  return monthDay.format(s);
};

// ---------- numbers ----------
const money = formatPrice;
// Axis ticks: "Rs 12K", "Rs 1.5M" — short enough for the y-axis.
const compact = new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 1 });
const moneyShort = (n) => `${n < 0 ? "-" : ""}Rs ${compact.format(Math.abs(n))}`;
const pct = (x) => `${Math.round(x * 100)}%`;

// Change vs the previous period. null when there is nothing to compare with.
const growth = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);

// Clean axis ticks: 0 / 5,000 / 10,000 ... covering min..max (min may be negative for losses).
function niceTicks(min, max, count = 4) {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

// ---------- column chart (one series; negative values drop below the zero line) ----------
const ColumnChart = ({ rows, valueKey, groupBy, title, emptyText }) => {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = rows.map((r) => r[valueKey]);
  const hasData = values.some((v) => v !== 0);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const H = 220, padL = 64, padR = 8, padT = 12, padB = 28;
  const plotW = width - padL - padR, plotH = H - padT - padB;
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const band = plotW / Math.max(rows.length, 1);
  // Thin columns: capped at 24px and never touching (a gap of at least 2px).
  const barW = Math.max(2, Math.min(24, band - Math.max(2, band * 0.3)));
  // Only as many x labels as fit (~60px each), evenly spread, always including the last.
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 64))));
  const zeroY = y(0);

  const bar = (v, x) => {
    const top = Math.min(y(v), zeroY), h = Math.max(Math.abs(y(v) - zeroY), v === 0 ? 0 : 1);
    const r = Math.min(4, barW / 2, h);
    // 4px rounded data-end, square at the baseline: the rounded end is the one away from zero.
    if (v >= 0) return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
    return `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + barW - r} Q${x + barW},${top + h} ${x + barW},${top + h - r} V${top} Z`;
  };

  return (
    <figure className="rp-chart">
      <figcaption className="rp-chart-title">{title}</figcaption>
      <div className="rp-chart-wrap" ref={wrapRef}>
        {!hasData ? (
          <div className="rp-chart-empty">{emptyText}</div>
        ) : (
          <svg width={width} height={H} role="img" aria-label={`${title} chart. Exact numbers are in the table below.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={`rp-gridline${t === 0 ? " zero" : ""}`} x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} />
                <text className="rp-axis" x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end">{moneyShort(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const v = r[valueKey];
              const x = padL + i * band + (band - barW) / 2;
              return (
                <g key={r.start}>
                  {v !== 0 && <path className={v < 0 ? "rp-bar neg" : "rp-bar"} d={bar(v, x)} opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {/* Whole band is the hover target, bigger than a thin bar. */}
                  <rect
                    x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  />
                  {(i % every === 0 || i === rows.length - 1) && (rows.length - 1 - i >= every || i === rows.length - 1) && (
                    <text className="rp-axis" x={padL + i * band + band / 2} y={H - 8} textAnchor="middle">{periodLabel(r, groupBy)}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && rows[hover] && (
          <div
            className="rp-tip"
            style={{ left: Math.min(Math.max(padL + hover * band + band / 2, 90), width - 90), top: 4 }}
            role="status"
          >
            <strong>{periodLabel(rows[hover], groupBy)}</strong>
            <span>{title}: {money(rows[hover][valueKey])}</span>
            <span className="rp-tip-sub">{rows[hover].orders} {rows[hover].orders === 1 ? "order" : "orders"}</span>
          </div>
        )}
      </div>
    </figure>
  );
};

// ---------- stat tile ----------
const Delta = ({ value, prevLabel }) => {
  if (value === null || !Number.isFinite(value)) return <span className="rp-delta flat">No data for {prevLabel}</span>;
  const up = value >= 0;
  // Icon + sign + word, never colour alone.
  return (
    <span className={`rp-delta ${up ? "up" : "down"}`}>
      {up ? <FiArrowUpRight aria-hidden="true" /> : <FiArrowDownRight aria-hidden="true" />}
      {up ? "+" : "−"}{pct(Math.abs(value))} vs {prevLabel}
    </span>
  );
};

// ---------- CSV ----------
// Why commented out: replaced by a real Excel file and a real PDF (Admin/utils/exportFiles.js);
// plain CSV had no title, summary or formatting. Kept in case a raw CSV is wanted again.
/* const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(report) {
  const head = ["Period start", "Period end", "Orders", "Items sold", "Sales (Rs)", "Cost (Rs)", "Profit (Rs)", "Cancelled orders"];
  const rows = report.series.map((r) => [r.start, r.end, r.orders, r.itemsSold, r.revenue, r.cost, r.profit, r.cancelled]);
  const t = report.totals;
  rows.push(["Total", "", t.orders, t.itemsSold, t.revenue, t.cost, t.profit, t.cancelled]);
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  // BOM so Excel opens it as UTF-8.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopzinc-sales-${report.from}-to-${report.to}-by-${report.groupBy}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
} */

const AdminReports = () => {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);

  // Resolve the filters from the URL (defaults: last 30 days by day).
  const presetId = PRESETS.some((p) => p.id === params.get("range")) ? params.get("range") : "30d";
  const preset = PRESETS.find((p) => p.id === presetId);
  const [pFrom, pTo] = preset.range ? preset.range(today).map(ymd) : [params.get("from") || ymd(addDays(today, -29)), params.get("to") || ymd(today)];
  const from = pFrom, to = pTo;
  const groupBy = GROUPS.some(([g]) => g === params.get("group")) ? params.get("group") : (preset.group || "day");

  const [state, setState] = useState({ loading: true, error: "", report: null });
  // Which file is being built ("pdf" | "xlsx"), so its button shows progress and can't be double-clicked.
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const adminName = useSelector((s) => s.auth.user?.name);

  const runExport = async (kind) => {
    if (!state.report || exporting) return;
    setExporting(kind);
    setExportError("");
    try {
      const fn = kind === "pdf" ? downloadReportPdf : downloadReportXlsx;
      await fn(state.report, { generatedBy: adminName });
    } catch (err) {
      setExportError("Could not create the file. Please try again.");
      console.error(err);
    } finally {
      setExporting("");
    }
  };

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api.get("/reports/sales", { params: { from, to, groupBy, tzOffset: new Date().getTimezoneOffset() } })
      .then((res) => alive && setState({ loading: false, error: "", report: res.data }))
      .catch((err) => alive && setState({ loading: false, error: err.response?.data?.message || "Could not load the report", report: null }));
    return () => { alive = false; };
  }, [from, to, groupBy]);

  const setFilter = (next) => {
    const merged = { range: presetId, group: groupBy, from, to, ...next };
    const p = PRESETS.find((x) => x.id === merged.range);
    // Presets set their own dates; only a custom range keeps from/to in the URL.
    const out = { range: merged.range, group: merged.group };
    if (!p.range) { out.from = merged.from; out.to = merged.to; }
    setParams(out, { replace: true });
  };

  const onPreset = (id) => {
    const p = PRESETS.find((x) => x.id === id);
    // A preset picks a sensible grouping (days for a month, months for a year).
    setFilter({ range: id, group: p.group || groupBy });
  };

  const report = state.report;
  const t = report?.totals;
  const prev = report?.previous;
  const prevLabel = "previous period";
  const coverage = t?.profitCoverage ?? 0;

  return (
    <div className="rp">
      <div className="adm-page-head rp-head">
        <div>
          <h2>Reports</h2>
          <p>Sales, profit and growth for {fullDate.format(parseYmd(from))} – {fullDate.format(parseYmd(to))}.</p>
        </div>
        <div className="rp-actions">
          {/* <button ... onClick={() => report && downloadCsv(report)}>Download CSV</button>
              <button ... onClick={() => window.print()}>Print / PDF</button> */}
          <button type="button" className="adm-btn secondary" onClick={() => runExport("xlsx")} disabled={!report || state.loading || Boolean(exporting)}>
            <FiDownload aria-hidden="true" /> {exporting === "xlsx" ? "Creating Excel..." : "Download Excel"}
          </button>
          <button type="button" className="adm-btn primary" onClick={() => runExport("pdf")} disabled={!report || state.loading || Boolean(exporting)}>
            <FiFileText aria-hidden="true" /> {exporting === "pdf" ? "Creating PDF..." : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Filters in one row above the numbers. */}
      <div className="adm-card rp-filters">
        <label className="rp-filter">
          <span className="adm-label">Date range</span>
          <select className="adm-select" value={presetId} onChange={(e) => onPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {presetId === "custom" && (
          <>
            <label className="rp-filter">
              <span className="adm-label">From</span>
              <input type="date" className="adm-input" value={from} max={to} onChange={(e) => e.target.value && setFilter({ from: e.target.value })} />
            </label>
            <label className="rp-filter">
              <span className="adm-label">To</span>
              <input type="date" className="adm-input" value={to} min={from} onChange={(e) => e.target.value && setFilter({ to: e.target.value })} />
            </label>
          </>
        )}
        <div className="rp-filter">
          <span className="adm-label" id="rp-group-label">Group by</span>
          <div className="adm-segmented" role="group" aria-labelledby="rp-group-label">
            {GROUPS.map(([g, label]) => (
              <button key={g} type="button" className={groupBy === g ? "active" : ""} aria-pressed={groupBy === g} onClick={() => setFilter({ group: g })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state.error && <div className="adm-error" role="alert">{state.error}</div>}
      {exportError && <div className="adm-error" role="alert">{exportError}</div>}
      {state.loading && !report && <div className="adm-empty">Loading report…</div>}

      {report && (
        <div className={state.loading ? "rp-body loading" : "rp-body"} aria-busy={state.loading}>
          {/* ---------- Summary ---------- */}
          <div className="rp-stats">
            <div className="adm-stat">
              <div className="adm-stat-label">Sales</div>
              <div className="adm-stat-value">{money(t.revenue)}</div>
              <Delta value={growth(t.revenue, prev.revenue)} prevLabel={prevLabel} />
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">{t.profit < 0 ? "Loss" : "Profit"}</div>
              <div className={`adm-stat-value${t.profit < 0 ? " rp-loss" : ""}`}>{coverage > 0 ? money(t.profit) : "—"}</div>
              {coverage > 0
                ? <span className="adm-stat-note">{t.margin !== null ? `${pct(t.margin)} margin` : ""}{coverage < 1 ? ` · covers ${pct(coverage)} of sales` : ""}</span>
                : <span className="adm-stat-note">Add cost prices to products to see profit</span>}
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">Orders</div>
              <div className="adm-stat-value">{t.orders.toLocaleString()}</div>
              <Delta value={growth(t.orders, prev.orders)} prevLabel={prevLabel} />
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">Average order</div>
              <div className="adm-stat-value">{money(t.avgOrder)}</div>
              <span className="adm-stat-note">{t.itemsSold.toLocaleString()} items sold</span>
            </div>
          </div>

          {coverage > 0 && coverage < 1 && (
            <p className="rp-note">
              <FiInfo aria-hidden="true" /> Profit only counts products that had a cost price when they were sold
              ({pct(coverage)} of sales). Add cost prices in <Link to="/admin/view">Products</Link> to make it complete.
            </p>
          )}
          {t.cancelled > 0 && <p className="rp-note"><FiInfo aria-hidden="true" /> {t.cancelled} cancelled {t.cancelled === 1 ? "order is" : "orders are"} not counted in sales.</p>}

          {/* ---------- Charts: two charts, never one chart with two scales ---------- */}
          <div className="adm-card rp-charts">
            <ColumnChart rows={report.series} valueKey="revenue" groupBy={groupBy} title="Sales" emptyText="No sales in this range." />
            <ColumnChart rows={report.series} valueKey="profit" groupBy={groupBy} title="Profit / loss" emptyText="No profit data yet — add cost prices to products." />
          </div>

          <div className="rp-cols">
            {/* ---------- Table view (exact numbers for every bar) ---------- */}
            <section className="adm-card">
              <div className="adm-card-header"><h4>By {groupBy}</h4></div>
              <div className="adm-table-wrap">
                <table className="adm-table rp-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="num">Orders</th>
                      <th className="num">Items</th>
                      <th className="num">Sales</th>
                      <th className="num">Cost</th>
                      <th className="num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.series.map((r) => (
                      <tr key={r.start} className={r.orders === 0 ? "rp-row-empty" : ""}>
                        <td>{periodLabel(r, groupBy)}</td>
                        <td className="num">{r.orders}</td>
                        <td className="num">{r.itemsSold}</td>
                        <td className="num">{money(r.revenue)}</td>
                        <td className="num">{r.cost ? money(r.cost) : "—"}</td>
                        <td className={`num${r.profit < 0 ? " rp-loss" : ""}`}>{r.profitCoverage > 0 ? money(r.profit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{t.orders}</td>
                      <td className="num">{t.itemsSold}</td>
                      <td className="num">{money(t.revenue)}</td>
                      <td className="num">{t.cost ? money(t.cost) : "—"}</td>
                      <td className={`num${t.profit < 0 ? " rp-loss" : ""}`}>{coverage > 0 ? money(t.profit) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* ---------- Top products ---------- */}
            <section className="adm-card">
              <div className="adm-card-header"><h4>Top products</h4></div>
              {report.topProducts.length === 0 ? (
                <div className="adm-empty">No products sold in this range.</div>
              ) : (
                <ol className="rp-top">
                  {report.topProducts.map((p, i) => (
                    <li key={p.productId}>
                      <span className="rp-top-rank">{i + 1}</span>
                      <span className="rp-top-name" title={p.name}>{p.name}</span>
                      <span className="rp-top-qty">{p.quantity} sold</span>
                      <span className="rp-top-rev">{money(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;
