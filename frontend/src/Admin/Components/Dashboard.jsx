import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { LuBanknote } from "react-icons/lu"; // currency-neutral: the store is in PKR, a $ icon was wrong
import {
  /* FaDollarSign, */ FaShoppingBag, FaBoxOpen, FaUsers,
  FaExclamationTriangle, FaTimesCircle, FaCheckCircle, FaClock, FaPlus,
} from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import "./../Styles/dashboard.css";
import SalesTrendChart from "./SalesTrendChart";

// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) =>
//   Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = formatPrice;

const LOW_STOCK = 5;
const ORDER_STATUSES = ["processing", "shipped", "delivered", "cancelled"];

// Badges always pair colour with an icon + word, so state is never colour-only.
const STATUS_BADGE = {
  paid: ["good", FaCheckCircle, "Paid"],
  pending: ["warning", FaClock, "Pending"],
  failed: ["critical", FaTimesCircle, "Failed"],
  processing: ["warning", FaClock, "Processing"],
  shipped: ["info", FaShoppingBag, "Shipped"],
  delivered: ["good", FaCheckCircle, "Delivered"],
  cancelled: ["critical", FaTimesCircle, "Cancelled"],
};

const Badge = ({ value }) => {
  const [tone, Icon, label] = STATUS_BADGE[value] || ["neutral", FaClock, value || "—"];
  return (
    <span className={`adm-badge ${tone}`}>
      <Icon aria-hidden="true" /> {label}
    </span>
  );
};

// One-series horizontal bars: single hue, value in text ink, tooltip on the whole row.
const BarList = ({ rows, total, unit }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="dash-bars">
      {rows.map((r) => {
        const share = total ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.label} className="dash-bar-row" data-tip={`${r.value} ${unit} · ${share}%`}>
            <span className="dash-bar-label">{r.label}</span>
            <span className="dash-bar-track">
              <span className="dash-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="dash-bar-value">{r.value}</span>
          </li>
        );
      })}
    </ul>
  );
};

const Dashboard = () => {
  const admin = useSelector((state) => state.auth.user);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Plain API calls, not redux: this page is read-only and must not overwrite the storefront's
    // paginated product list in state.products.
    // Not /payments: that endpoint currently populates users with their password hash.
    // The product list (limit=1000, the API max) is still loaded for the low-stock list: there is no
    // stock filter on the API. Counts come from totalProducts + /products/facets instead, because
    // counting the list is wrong once the catalog passes 1000.
    Promise.all([
      api.get("/products?page=1&limit=1000"),
      api.get("/orders"),
      api.get("/users"),
      api.get("/category"),
      api.get("/products/facets"),
    ])
      .then(([p, o, u, c, f]) =>
        setData({
          products: p.data.data || [],
          // Real catalog size; products.length stops at 1000.
          totalProducts: p.data.totalProducts ?? (p.data.data || []).length,
          orders: Array.isArray(o.data) ? o.data : [],
          users: u.data.users || [],
          categories: Array.isArray(c.data) ? c.data : [],
          // Per-category counts over the whole catalog, keyed by category id.
          categoryCounts: Object.fromEntries((f.data?.categories || []).map((x) => [x._id, x.count])),
        })
      )
      .catch((e) => setError(e.response?.data?.message || "Could not load dashboard data"));
  }, []);

  if (error) return <div className="adm-error">{error}</div>;
  if (!data) return <div className="adm-empty">Loading dashboard…</div>;

  const { products, totalProducts, orders, users, categories, categoryCounts } = data;
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const revenue = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const customers = users.filter((u) => u.role === "user");
  const lowStock = products
    .filter((p) => p.stock <= LOW_STOCK)
    .sort((a, b) => a.stock - b.stock);
  const userName = Object.fromEntries(users.map((u) => [u._id, u.name]));

  const statusRows = ORDER_STATUSES.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    value: orders.filter((o) => o.orderStatus === s).length,
  }));
  // const categoryRows = categories
  //   .map((c) => ({ label: c.name, value: products.filter((p) => p.category?._id === c._id).length }))
  // Facet counts, not the 1000-item list, so each bar is right on a big catalog.
  const categoryRows = categories
    .map((c) => ({ label: c.name, value: categoryCounts[c._id] || 0 }))
    .sort((a, b) => b.value - a.value);

  const recent = [...orders]
    .sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt))
    .slice(0, 5);

  const kpis = [
    { label: "Revenue", value: money(revenue), note: `from ${paid.length} paid order${paid.length === 1 ? "" : "s"}`, Icon: LuBanknote, hero: true },
    { label: "Orders", value: orders.length, note: `${statusRows[0].value} processing`, Icon: FaShoppingBag },
    // { label: "Products", value: products.length, note: `${lowStock.length} low on stock`, Icon: FaBoxOpen, alert: lowStock.length > 0 },
    { label: "Products", value: totalProducts, note: `${lowStock.length} low on stock`, Icon: FaBoxOpen, alert: lowStock.length > 0 },
    { label: "Customers", value: customers.length, note: `${customers.filter((u) => u.isVerified).length} verified`, Icon: FaUsers },
  ];

  return (
    <div className="dash">
      <div className="adm-page-head">
        <div>
          <h2>Welcome back{admin?.name ? `, ${admin.name.split(" ")[0]}` : ""}</h2>
          <p>Here is what is happening in your store today.</p>
        </div>
        <Link to="/admin/create" className="adm-btn primary"><FaPlus aria-hidden="true" /> Add product</Link>
      </div>

      <section className="adm-grid-4" aria-label="Key numbers">
        {kpis.map(({ label, value, note, Icon, hero, alert }) => (
          <div key={label} className={`adm-stat dash-kpi${hero ? " hero" : ""}`}>
            <div className="dash-kpi-top">
              <span className="adm-stat-label">{label}</span>
              <span className="dash-kpi-icon"><Icon aria-hidden="true" /></span>
            </div>
            <div className="adm-stat-value">{value}</div>
            <div className={`adm-stat-note${alert ? " is-warn" : ""}`}>{note}</div>
          </div>
        ))}
      </section>

      {/* Chart.js sales trend (this period vs the previous one), from the same API as Reports. */}
      <SalesTrendChart />

      <section className="adm-grid-2">
        <div className="adm-card dash-panel">
          <div className="adm-card-header"><h4>Orders by status</h4><span className="adm-muted">{orders.length} total</span></div>
          {orders.length ? <BarList rows={statusRows} total={orders.length} unit="orders" /> : <p className="adm-empty">No orders yet.</p>}
        </div>
        <div className="adm-card dash-panel">
          {/* <div className="adm-card-header"><h4>Products by category</h4><span className="adm-muted">{products.length} products</span></div>
          {categoryRows.length ? <BarList rows={categoryRows} total={products.length} unit="products" /> : <p className="adm-empty">No categories yet.</p>} */}
          {/* totalProducts, not products.length: the list stops at 1000, so the header and % shares were wrong past that. */}
          <div className="adm-card-header"><h4>Products by category</h4><span className="adm-muted">{totalProducts} products</span></div>
          {categoryRows.length ? <BarList rows={categoryRows} total={totalProducts} unit="products" /> : <p className="adm-empty">No categories yet.</p>}
        </div>
      </section>

      <section className="dash-grid wide">
        <div className="adm-card dash-panel">
          <div className="adm-card-header"><h4>Recent orders</h4><Link to="/admin/orders" className="adm-btn ghost sm">View all</Link></div>
          {recent.length ? (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr><th>Order</th><th>Customer</th><th className="num">Items</th><th className="num">Total</th><th>Payment</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o._id}>
                      <td className="mono">#{o._id.slice(-6).toUpperCase()}</td>
                      <td>{userName[o.user] || "Unknown"}</td>
                      <td className="num">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td className="num">{money(o.totalAmount)}</td>
                      <td><Badge value={o.paymentStatus} /></td>
                      <td><Badge value={o.orderStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="adm-empty">No orders yet.</p>}
        </div>

        <div className="adm-card dash-panel">
          <div className="adm-card-header"><h4>Stock alerts</h4><Link to="/admin/inventory" className="adm-btn ghost sm">Manage</Link></div>
          {lowStock.length ? (
            <ul className="dash-stock">
              {lowStock.map((p) => (
                <li key={p._id}>
                  <span className="dash-stock-name">{p.name}</span>
                  <span className="dash-stock-qty">{p.stock} left</span>
                  {p.stock === 0 ? (
                    <span className="adm-badge critical"><FaTimesCircle aria-hidden="true" /> Out of stock</span>
                  ) : (
                    <span className="adm-badge warning"><FaExclamationTriangle aria-hidden="true" /> Low</span>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="adm-empty">All products are well stocked.</p>}
          {/* Stock alerts only see the first 1000 products (API max, no stock filter); say so instead of hiding it. */}
          {totalProducts > products.length && (
            <p className="adm-muted">Checked the first {products.length} of {totalProducts} products.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
