import React, { useEffect, useMemo, useState } from "react";
import { FaSearch, FaCheckCircle, FaExclamationTriangle, FaTimesCircle, FaMinus, FaPlus, FaBoxOpen } from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import "./../Styles/inventory.css";

// Same threshold drives the stat, the filter and the badge, so they never disagree.
const LOW = 5;

const statusOf = (stock) => (stock <= 0 ? "out" : stock <= LOW ? "low" : "in");

// Badge always pairs colour with an icon + word so it reads without colour vision.
const STATUS = {
  in: { cls: "good", icon: <FaCheckCircle />, label: "In stock" },
  low: { cls: "warning", icon: <FaExclamationTriangle />, label: "Low stock" },
  out: { cls: "critical", icon: <FaTimesCircle />, label: "Out of stock" },
};

// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = formatPrice;

// Own state per row, so saving one row never blocks or resets the others.
const StockEditor = ({ product, onSaved }) => {
  const [value, setValue] = useState(String(product.stock ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0;
  const dirty = valid && n !== product.stock;

  const step = (d) => {
    const base = valid ? n : product.stock || 0;
    setValue(String(Math.max(0, base + d)));
    setError("");
  };

  const save = async () => {
    if (!valid) return setError("Whole number, 0 or more");
    setSaving(true);
    setError("");
    try {
      // Multipart because the route runs multer; the server updates only the fields sent and keeps images.
      const fd = new FormData();
      fd.append("stock", n);
      const { data } = await api.put(`/update/${product._id}`, fd);
      onSaved(data.product);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inv-editor">
      <div className="inv-stepper">
        <button type="button" className="adm-btn ghost sm icon" aria-label="Decrease stock" disabled={saving} onClick={() => step(-1)}>
          <FaMinus />
        </button>
        <input
          type="number"
          min="0"
          step="1"
          className="adm-input inv-stock-input"
          aria-label={`Stock for ${product.name}`}
          value={value}
          disabled={saving}
          onInput={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        />
        <button type="button" className="adm-btn ghost sm icon" aria-label="Increase stock" disabled={saving} onClick={() => step(1)}>
          <FaPlus />
        </button>
        <button type="button" className="adm-btn primary sm" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {(error || (!valid && value !== "")) && (
        <div className="adm-error inv-row-error" role="alert">{error || "Whole number, 0 or more"}</div>
      )}
    </div>
  );
};

const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("all");
  // Real catalog size from the API. The list below stops at 1000 (API max), so products.length can be short.
  const [totalProducts, setTotalProducts] = useState(0);

  useEffect(() => {
    // ponytail: loads the whole catalog in one call (limit=1000); page it server-side if the catalog outgrows that.
    // Kept at 1000: the table, stock sums and client-side filters need the real rows, not just a count.
    Promise.all([api.get("/products", { params: { page: 1, limit: 1000 } }), api.get("/category")])
      .then(([p, c]) => {
        setProducts(p.data?.data || []);
        setTotalProducts(p.data?.totalProducts ?? (p.data?.data || []).length);
        setCategories(Array.isArray(c.data) ? c.data : []);
      })
      .catch((err) => setLoadError(err.response?.data?.message || "Could not load inventory"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    let units = 0, value = 0, low = 0, out = 0;
    for (const p of products) {
      const s = Number(p.stock) || 0;
      units += s;
      value += (Number(p.price) || 0) * s;
      const st = statusOf(s);
      if (st === "low") low++;
      if (st === "out") out++;
    }
    return { units, value, low, out };
  }, [products]);

  // Bar is relative to the biggest stock on hand, so it shows "how full" compared to the rest of the catalog.
  const maxStock = useMemo(() => Math.max(1, ...products.map((p) => Number(p.stock) || 0)), [products]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !q || `${p.name} ${p.brand || ""}`.toLowerCase().includes(q))
      .filter((p) => !category || p.category?._id === category)
      .filter((p) => filter === "all" || statusOf(Number(p.stock) || 0) === filter)
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
  }, [products, search, category, filter]);

  const onSaved = (updated) =>
    setProducts((list) => list.map((p) => (p._id === updated._id ? { ...p, ...updated } : p)));

  const segments = [
    ["all", "All"],
    ["in", "In stock"],
    ["low", "Low"],
    ["out", "Out of stock"],
  ];

  return (
    <div className="inv-page">
      <div className="adm-page-head">
        <div>
          <h2>Inventory</h2>
          <p>Stock levels across the catalog. Low stock means {LOW} units or fewer.</p>
        </div>
      </div>

      <div className="adm-grid-4 inv-stats">
        <div className="adm-stat">
          <div className="adm-stat-label">Units in stock</div>
          <div className="adm-stat-value">{stats.units.toLocaleString()}</div>
          {/* <div className="adm-stat-note">{products.length} products</div> */}
          {/* Say when only part of the catalog is loaded, or every number on this page looks complete when it is not. */}
          <div className="adm-stat-note">
            {totalProducts > products.length ? `first ${products.length} of ${totalProducts} products` : `${products.length} products`}
          </div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Stock value</div>
          <div className="adm-stat-value">{money(stats.value)}</div>
          <div className="adm-stat-note">price × stock, before discounts</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Low stock</div>
          <div className="adm-stat-value">{stats.low}</div>
          <div className="adm-stat-note">1–{LOW} units left</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Out of stock</div>
          <div className="adm-stat-value">{stats.out}</div>
          <div className="adm-stat-note">cannot be sold</div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-toolbar">
          <label className="adm-search">
            <FaSearch aria-hidden="true" />
            <input
              className="adm-input"
              type="search"
              placeholder="Search name or brand"
              aria-label="Search products"
              value={search}
              onInput={(e) => setSearch(e.target.value)}
            />
          </label>
          <select className="adm-select" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <div className="adm-segmented" role="group" aria-label="Stock status">
            {segments.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filter === key ? "active" : ""}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loadError && <div className="adm-error inv-load-error" role="alert">{loadError}</div>}

        {loading ? (
          <div className="adm-empty">Loading inventory…</div>
        ) : rows.length === 0 ? (
          <div className="adm-empty">
            <FaBoxOpen aria-hidden="true" />
            <p>{products.length === 0 ? "No products yet." : "No products match these filters."}</p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th className="actions">Adjust stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const stock = Number(p.stock) || 0;
                  const st = STATUS[statusOf(stock)];
                  return (
                    <tr key={p._id}>
                      <td>
                        <div className="inv-product">
                          {p.images?.[0]?.url ? (
                            <img className="inv-thumb" src={p.images[0].url} alt="" loading="lazy" />
                          ) : (
                            <span className="inv-thumb inv-thumb-empty" aria-hidden="true"><FaBoxOpen /></span>
                          )}
                          <div className="inv-product-text">
                            <div className="inv-name">{p.name}</div>
                            <div className="adm-muted">{p.brand || "No brand"}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.category?.name || <span className="adm-muted">—</span>}</td>
                      <td className="num mono">{money(p.price)}</td>
                      <td>
                        <div className="inv-stock">
                          <span className="mono">{stock}</span>
                          <span className={`inv-bar ${st.cls}`} aria-hidden="true">
                            <span style={{ width: `${Math.min(100, (stock / maxStock) * 100)}%` }} />
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`adm-badge ${st.cls}`}>{st.icon} {st.label}</span>
                      </td>
                      <td className="actions">
                        {/* key on stock so the editor resets to the saved value after a successful save */}
                        <StockEditor key={`${p._id}-${stock}`} product={{ ...p, stock }} onSaved={onSaved} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
