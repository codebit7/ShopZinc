import React, { useEffect, useMemo, useState } from "react";
import {
  FaSearch, FaCheckCircle, FaClock, FaUserShield, FaUser, FaTimes, FaUsers, FaMapMarkerAlt, FaReceipt,
} from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import "./../Styles/inventory.css";

const DAY = 24 * 60 * 60 * 1000;

// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = formatPrice;
const date = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

// Badges pair colour with an icon + word so they read without colour vision.
const RoleBadge = ({ role }) =>
  role === "admin" ? (
    <span className="adm-badge info"><FaUserShield /> Admin</span>
  ) : (
    <span className="adm-badge neutral"><FaUser /> Customer</span>
  );

const VerifiedBadge = ({ ok }) =>
  ok ? (
    <span className="adm-badge good"><FaCheckCircle /> Verified</span>
  ) : (
    <span className="adm-badge warning"><FaClock /> Unverified</span>
  );

const ORDER_CLS = { processing: "info", shipped: "info", delivered: "good", cancelled: "critical" };
const PAY_CLS = { paid: "good", pending: "warning", failed: "critical" };

const Customers = () => {
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/users"),
      // GET /orders answers 404 when there are no orders at all; that means "empty", not a failure.
      api.get("/orders").catch((err) => {
        if (err.response?.status === 404) return { data: [] };
        throw err;
      }),
    ])
      .then(([u, o]) => {
        setUsers(u.data?.users || []);
        setOrders(Array.isArray(o.data) ? o.data : []);
      })
      .catch((err) => setLoadError(err.response?.data?.message || "Could not load customers"))
      .finally(() => setLoading(false));
  }, []);

  // Order.user is a bare id (not populated), so group once here instead of filtering per row.
  const ordersByUser = useMemo(() => {
    const map = {};
    for (const o of orders) {
      const id = String(o.user?._id || o.user);
      (map[id] ||= []).push(o);
    }
    return map;
  }, [orders]);

  const statsFor = (id) => {
    const list = ordersByUser[id] || [];
    const spent = list.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    return { list, count: list.length, spent };
  };

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      customers: users.filter((u) => u.role === "user").length,
      verified: users.filter((u) => u.isVerified).length,
      admins: users.filter((u) => u.role === "admin").length,
      recent: users.filter((u) => u.createdAt && now - new Date(u.createdAt).getTime() <= 7 * DAY).length,
    };
  }, [users]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
      .filter((u) =>
        filter === "verified" ? u.isVerified : filter === "unverified" ? !u.isVerified : filter === "admins" ? u.role === "admin" : true
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [users, search, filter]);

  const open = users.find((u) => u._id === openId);
  const openStats = open ? statsFor(open._id) : null;

  // Escape closes the drawer, same as the close button.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const segments = [
    ["all", "All"],
    ["verified", "Verified"],
    ["unverified", "Unverified"],
    ["admins", "Admins"],
  ];

  return (
    <div className="cus-page">
      <div className="adm-page-head">
        <div>
          <h2>Customers</h2>
          <p>Everyone with an account. Read-only — accounts can't be edited from here yet.</p>
        </div>
      </div>

      <div className="adm-grid-4 inv-stats">
        <div className="adm-stat">
          <div className="adm-stat-label">Customers</div>
          <div className="adm-stat-value">{stats.customers}</div>
          <div className="adm-stat-note">role: user</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Verified</div>
          <div className="adm-stat-value">{stats.verified}</div>
          <div className="adm-stat-note">of {users.length} accounts</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Admins</div>
          <div className="adm-stat-value">{stats.admins}</div>
          <div className="adm-stat-note">full store access</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">New this week</div>
          <div className="adm-stat-value">{stats.recent}</div>
          <div className="adm-stat-note">joined in the last 7 days</div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-toolbar">
          <label className="adm-search">
            <FaSearch aria-hidden="true" />
            <input
              className="adm-input"
              type="search"
              placeholder="Search name or email"
              aria-label="Search customers"
              value={search}
              onInput={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="adm-segmented" role="group" aria-label="Filter customers">
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
          <div className="adm-empty">Loading customers…</div>
        ) : rows.length === 0 ? (
          <div className="adm-empty">
            <FaUsers aria-hidden="true" />
            <p>{users.length === 0 ? "No accounts yet." : "No customers match these filters."}</p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table cus-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="num">Orders</th>
                  <th className="num">Total spent</th>
                  <th className="num">Wishlist</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const s = statsFor(u._id);
                  const select = () => setOpenId(openId === u._id ? null : u._id);
                  return (
                    <tr
                      key={u._id}
                      className={`cus-row ${openId === u._id ? "selected" : ""}`}
                      tabIndex={0}
                      aria-label={`Open details for ${u.name}`}
                      onClick={select}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select())}
                    >
                      <td>
                        <div className="cus-person">
                          <span className="cus-avatar" aria-hidden="true">{(u.name || u.email || "?").charAt(0).toUpperCase()}</span>
                          <div className="inv-product-text">
                            <div className="inv-name">{u.name}</div>
                            <div className="adm-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><RoleBadge role={u.role} /></td>
                      <td><VerifiedBadge ok={u.isVerified} /></td>
                      <td className="num mono">{s.count}</td>
                      <td className="num mono">{money(s.spent)}</td>
                      <td className="num mono">{u.wishlist?.length || 0}</td>
                      <td>{date(u.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="cus-backdrop" onClick={() => setOpenId(null)} />
          <aside className="cus-drawer" role="dialog" aria-modal="true" aria-label={`${open.name} details`}>
            <div className="cus-drawer-head">
              <div className="cus-person">
                <span className="cus-avatar lg" aria-hidden="true">{(open.name || "?").charAt(0).toUpperCase()}</span>
                <div className="inv-product-text">
                  <div className="inv-name">{open.name}</div>
                  <div className="adm-muted">{open.email}</div>
                </div>
              </div>
              <button type="button" className="adm-btn ghost sm icon" aria-label="Close" onClick={() => setOpenId(null)}>
                <FaTimes />
              </button>
            </div>

            <div className="cus-drawer-body">
              <div className="cus-badges">
                <RoleBadge role={open.role} />
                <VerifiedBadge ok={open.isVerified} />
              </div>

              <dl className="cus-facts">
                <div><dt>Joined</dt><dd>{date(open.createdAt)}</dd></div>
                <div><dt>Orders</dt><dd className="mono">{openStats.count}</dd></div>
                <div><dt>Total spent</dt><dd className="mono">{money(openStats.spent)}</dd></div>
                <div><dt>Wishlist</dt><dd className="mono">{open.wishlist?.length || 0}</dd></div>
              </dl>

              <h5 className="cus-section-title"><FaMapMarkerAlt aria-hidden="true" /> Addresses</h5>
              {open.addresses?.length ? (
                <ul className="cus-list">
                  {open.addresses.map((a, i) => (
                    <li key={a._id || i}>
                      <div>{[a.street, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}</div>
                      <div className="adm-muted">
                        {a.country || ""}
                        {a.isDefault && <span className="adm-badge neutral cus-default"><FaCheckCircle /> Default</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="adm-muted">No saved addresses.</p>
              )}

              <h5 className="cus-section-title"><FaReceipt aria-hidden="true" /> Orders</h5>
              {openStats.list.length ? (
                <ul className="cus-list">
                  {[...openStats.list]
                    .sort((a, b) => new Date(b.orderDate || b.createdAt || 0) - new Date(a.orderDate || a.createdAt || 0))
                    .map((o) => (
                      <li key={o._id} className="cus-order">
                        <div>
                          <div className="mono">#{String(o._id).slice(-8)}</div>
                          <div className="adm-muted">{date(o.orderDate || o.createdAt)}</div>
                        </div>
                        <div className="cus-order-meta">
                          <span className="mono">{money(o.totalAmount)}</span>
                          <span className={`adm-badge ${PAY_CLS[o.paymentStatus] || "neutral"}`}>
                            {o.paymentStatus === "paid" ? <FaCheckCircle /> : <FaClock />} {o.paymentStatus || "unknown"}
                          </span>
                          <span className={`adm-badge ${ORDER_CLS[o.orderStatus] || "neutral"}`}>
                            {o.orderStatus === "cancelled" ? <FaTimes /> : <FaReceipt />} {o.orderStatus || "unknown"}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="adm-muted">No orders yet.</p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default Customers;
