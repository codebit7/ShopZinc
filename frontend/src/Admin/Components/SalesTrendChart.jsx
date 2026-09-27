import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiArrowDownRight, FiInfo } from "react-icons/fi";
import {
  Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend,
} from "chart.js";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";

// Only the pieces this chart uses, so the bundle stays small.
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

// Dashboard trends. Tabs pick what to plot, and every tab has ONE y-axis (money and counts never share
// a scale — that misleads):
//   Money      -> Sales, Profit, Cost lines together (all Rs)
//   Orders / Items sold / Avg order -> this period vs the previous period of the same length
// Numbers come from GET /reports/sales (server-side money math, same as the Reports page).

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const TABS = [
  { id: "money", label: "Money" },
  { id: "orders", label: "Orders" },
  { id: "items", label: "Items sold" },
  { id: "avg", label: "Avg order" },
];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (s) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
const compact = new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 1 });
const moneyTick = (v) => `${v < 0 ? "-" : ""}Rs ${compact.format(Math.abs(v))}`;
const count = (n) => Math.round(n).toLocaleString();

// Series colours, checked with the dataviz palette validator on the card surface (light and dark).
// Sales = brand blue, Profit = aqua, Cost = orange. Profit/Cost are close for red-green colour
// blindness, so each line also has its own marker shape (circle / triangle / square) in legend + hover.
const SERIES = {
  light: { sales: "#5B67E8", profit: "#15966a", cost: "#eb6834", prev: "#B8BDC9" },
  dark: { sales: "#7680F2", profit: "#199e70", cost: "#d95926", prev: "#5A6275" },
};

const themeColors = (el) => {
  const dark = Boolean(el?.closest(".theme-dark"));
  const css = getComputedStyle(el || document.body);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    ...(dark ? SERIES.dark : SERIES.light),
    wash: dark ? "118,128,242" : "91,103,232",
    text: v("--sz-text", dark ? "#E6E8F2" : "#1B1F2A"),
    muted: v("--sz-muted", dark ? "#9AA3B5" : "#6B7280"),
    grid: dark ? "#232A3C" : "#EEF0F4",
    zero: dark ? "#3A4258" : "#C9CDD6",
    card: v("--sz-card", dark ? "#171C2C" : "#FFFFFF"),
  };
};

// Per-tab settings for the single-number tabs.
const METRIC = {
  orders: { key: "orders", name: "Orders", fmt: count, tick: (v) => count(v), total: (t) => t.orders, totalFmt: count },
  items: { key: "itemsSold", name: "Items sold", fmt: count, tick: (v) => count(v), total: (t) => t.itemsSold, totalFmt: count },
  // No orders that day = no average (a gap), not Rs 0 dragging the line down.
  avg: { key: "avgOrder", name: "Avg order", fmt: formatPrice, tick: moneyTick, total: (t) => t.avgOrder, totalFmt: formatPrice, value: (r) => (r.orders ? r.avgOrder : null) },
};

const SalesTrendChart = () => {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState("money");
  const [state, setState] = useState({ loading: true, error: "", cur: null, prev: null });
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  // Bumped when the admin switches light/dark, so the chart redraws in the new colours.
  const [themeTick, setThemeTick] = useState(0);

  // Two calls: this period by day, and the same number of days just before it.
  useEffect(() => {
    let alive = true;
    const today = new Date();
    const from = addDays(today, -(days - 1));
    const prevFrom = addDays(from, -days), prevTo = addDays(from, -1);
    const q = (f, t) => api.get("/reports/sales", { params: { from: ymd(f), to: ymd(t), groupBy: "day", tzOffset: today.getTimezoneOffset() } });
    setState((s) => ({ ...s, loading: true, error: "" }));
    Promise.all([q(from, today), q(prevFrom, prevTo)])
      .then(([a, b]) => alive && setState({ loading: false, error: "", cur: a.data, prev: b.data }))
      .catch((err) => alive && setState({ loading: false, error: err.response?.data?.message || "Could not load sales", cur: null, prev: null }));
    return () => { alive = false; };
  }, [days]);

  // Redraw on theme switch (AdminLayout toggles the theme-dark class on its root).
  useEffect(() => {
    const root = canvasRef.current?.closest(".admin-layout");
    if (!root) return;
    const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [state.cur]);

  const cur = state.cur?.series || [];
  const prev = state.prev?.series || [];
  // Profit/cost exist only where sold products had a cost price; elsewhere they are unknown, not 0.
  const hasCost = cur.some((r) => r.profitCoverage > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.cur) return;
    const c = themeColors(canvas);
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 280);
    grad.addColorStop(0, `rgba(${c.wash},0.24)`);
    grad.addColorStop(1, `rgba(${c.wash},0)`);

    // Shared line look: 2px, smooth, markers only on hover (ringed in the card colour).
    const line = (color, pointStyle, extra = {}) => ({
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      tension: 0.35,
      fill: false,
      pointStyle,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: c.card,
      pointHoverBorderWidth: 2,
      ...extra,
    });

    let datasets, yTick, rowFor;
    if (tab === "money") {
      datasets = [
        { label: "Sales", data: cur.map((r) => r.revenue), ...line(c.sales, "circle", { fill: "origin", backgroundColor: grad }), order: 1 },
      ];
      if (hasCost) {
        datasets.push(
          { label: "Profit", data: cur.map((r) => (r.profitCoverage > 0 ? r.profit : null)), ...line(c.profit, "triangle"), order: 2 },
          { label: "Cost", data: cur.map((r) => (r.profitCoverage > 0 ? r.cost : null)), ...line(c.cost, "rect"), order: 3 },
        );
      }
      yTick = moneyTick;
      rowFor = (item) => ({ row: cur[item.dataIndex], value: item.raw, fmt: formatPrice });
    } else {
      const m = METRIC[tab];
      datasets = [
        { label: `Last ${days} days`, data: cur.map((r) => (m.value ? m.value(r) : r[m.key])), ...line(c.sales, "circle", { fill: "origin", backgroundColor: grad }), order: 1 },
        // Lined up day-by-day with the current period (day 1 vs day 1).
        { label: `Previous ${days} days`, data: cur.map((_, i) => (prev[i] ? (m.value ? m.value(prev[i]) : prev[i][m.key]) : null)), ...line(c.prev, "circle"), order: 2 },
      ];
      yTick = m.tick;
      rowFor = (item) => ({ row: item.datasetIndex === 0 ? cur[item.dataIndex] : prev[item.dataIndex], value: item.raw, fmt: m.fmt });
    }

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: "line",
      data: { labels: cur.map((r) => label(r.start)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 4, right: 4 } },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { color: c.muted, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 } },
          },
          tooltip: {
            backgroundColor: c.text,
            titleColor: c.card,
            bodyColor: c.card,
            footerColor: c.card,
            padding: 10,
            cornerRadius: 8,
            usePointStyle: true,
            boxPadding: 4,
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex;
                return tab !== "money" && prev[i] ? `${label(cur[i].start)}  (vs ${label(prev[i].start)})` : label(cur[i].start);
              },
              label: (item) => {
                const { row, value, fmt } = rowFor(item);
                if (!row || value === null || value === undefined) return null;
                return ` ${item.dataset.label}: ${fmt(value)}`;
              },
              // Money tab: the order count for that day as context under the three amounts.
              footer: (items) => {
                if (tab !== "money") return "";
                const r = cur[items[0].dataIndex];
                return r ? `${r.orders} order${r.orders === 1 ? "" : "s"}` : "";
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: c.grid },
            ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: days <= 7 ? 7 : 8, font: { size: 11 } },
          },
          y: {
            // Zero always in view; losses (negative profit) go below it, on the stronger zero line.
            beginAtZero: true,
            grid: { color: (g) => (g.tick.value === 0 ? c.zero : c.grid), drawTicks: false },
            border: { display: false },
            ticks: { color: c.muted, padding: 8, maxTicksLimit: 5, precision: tab === "orders" || tab === "items" ? 0 : undefined, font: { size: 11 }, callback: yTick },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [state.cur, state.prev, days, tab, themeTick, hasCost]);

  // ---- headline number for the active tab
  const t = state.cur?.totals, pt = state.prev?.totals;
  let headline = "", change = null, sub = "";
  if (t) {
    if (tab === "money") {
      headline = formatPrice(t.revenue);
      change = pt?.revenue ? (t.revenue - pt.revenue) / pt.revenue : null;
      sub = hasCost ? `Profit ${formatPrice(t.profit)}${t.margin !== null ? ` · ${Math.round(t.margin * 100)}% margin` : ""}` : "";
    } else {
      const m = METRIC[tab];
      headline = m.totalFmt(m.total(t));
      const p = pt ? m.total(pt) : 0;
      change = p ? (m.total(t) - p) / p : null;
    }
  }
  const metricWord = tab === "money" ? "sales" : TABS.find((x) => x.id === tab).label.toLowerCase();
  const noData = state.cur && !cur.some((r) => r.orders > 0) && !prev.some((r) => r.orders > 0);

  return (
    <section className="adm-card dash-trend" aria-label="Store trends">
      <div className="adm-card-header dash-trend-head">
        <div className="dash-trend-title">
          <h4>Store trends</h4>
          <div className="dash-trend-figure">
            <span className="dash-trend-total">{headline || "—"}</span>
            {change !== null ? (
              // Icon + sign + words, never colour alone.
              <span className={`dash-trend-delta ${change >= 0 ? "up" : "down"}`}>
                {change >= 0 ? <FiArrowUpRight aria-hidden="true" /> : <FiArrowDownRight aria-hidden="true" />}
                {change >= 0 ? "+" : "−"}{Math.round(Math.abs(change) * 100)}% {metricWord} vs previous {days} days
              </span>
            ) : (
              t && <span className="dash-trend-delta flat">No {metricWord} in the previous {days} days</span>
            )}
            {sub && <span className="dash-trend-sub">{sub}</span>}
          </div>
        </div>
        <div className="dash-trend-tools">
          <div className="adm-segmented" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r.days} type="button" className={days === r.days ? "active" : ""} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
          <Link to="/admin/reports" className="adm-btn ghost sm">Full report</Link>
        </div>
      </div>

      {/* What to plot — one row of tabs above the chart. */}
      <div className="dash-trend-tabs" role="tablist" aria-label="What to show">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`dash-trend-tab${tab === x.id ? " active" : ""}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className={`dash-trend-body${state.loading ? " loading" : ""}`}>
        {state.error ? (
          <div className="adm-error" role="alert">{state.error}</div>
        ) : noData ? (
          <div className="dash-trend-empty">No orders in the last {days * 2} days yet.</div>
        ) : (
          <>
            {tab === "money" && state.cur && !hasCost && (
              <p className="dash-trend-note">
                <FiInfo aria-hidden="true" /> Profit and Cost lines appear once sold products have a cost price.{" "}
                <Link to="/admin/view">Add cost prices</Link>
              </p>
            )}
            <div className="dash-trend-canvas">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${TABS.find((x) => x.id === tab).label} for the last ${days} days. Exact numbers are on the Reports page.`}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default SalesTrendChart;
