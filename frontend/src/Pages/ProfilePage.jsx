import { useEffect, useState } from "preact/hooks";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate } from "react-router-dom";
import { FiArrowRight, FiCheck, FiCheckCircle, FiEdit2, FiX } from "react-icons/fi";
import { updateMe } from "../Store/slices/authSlice";
import api from "../api/client";
import StatusBadge from "./Account/StatusBadge";
import { formatDate, formatMoney, itemCount, itemImage, itemName, orderNumber } from "./Account/orderUtils";
// Redesigned inside AccountLayout (gradient hero + stat tiles looked generic). The old file is
// kept on disk; address editing moved to AddressesPage.
// import "./profilePage.css";
import "./Account/account.css";
import "./Account/orders.css"; // status badge styles

const memberSince = (iso) => formatDate(iso, { month: "long", year: "numeric" });

const ProfilePage = () => {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameStatus, setNameStatus] = useState({ saving: false, error: "", ok: false });

  // Recent orders come from the API, not user.orderHistory (that is only ids).
  const [orders, setOrders] = useState({ loading: true, error: "", list: [] });

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .get("/orders/me")
      .then((res) => alive && setOrders({ loading: false, error: "", list: Array.isArray(res.data) ? res.data : [] }))
      .catch((err) => alive && setOrders({ loading: false, error: err.response?.data?.message || "Could not load your orders", list: [] }));
    return () => { alive = false; };
  }, [user?.id]);

  // Hide "Saved" after a moment so it does not look stale on the next edit.
  useEffect(() => {
    if (!nameStatus.ok) return;
    const t = setTimeout(() => setNameStatus((s) => ({ ...s, ok: false })), 2500);
    return () => clearTimeout(t);
  }, [nameStatus.ok]);

  if (!user) {
    return <div className="acc-loading" role="status">Loading your account…</div>;
  }
  // Admin profile is managed in the admin panel; this page is built for shoppers (orders, addresses).
  // After all hooks on purpose, so the hook order never changes between renders.
  if (user.role === "admin") return <Navigate to="/admin/profile" replace />;

  const addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
  const since = memberSince(user.createdAt);
  const firstName = (user.name || "").trim().split(/\s+/)[0];
  const recent = orders.list.slice(0, 3);

  const saveName = async (e) => {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      setNameStatus({ saving: false, error: "Name can't be empty", ok: false });
      return;
    }
    setNameStatus({ saving: true, error: "", ok: false });
    const res = await dispatch(updateMe({ name }));
    if (updateMe.fulfilled.match(res)) {
      setEditingName(false);
      setNameStatus({ saving: false, error: "", ok: true });
    } else {
      setNameStatus({ saving: false, error: res.payload || "Could not save", ok: false });
    }
  };

  return (
    <div className="acc-page">
      <header className="acc-head">
        <h1 className="acc-title">{firstName ? `Hi, ${firstName}` : "Overview"}</h1>
        <p className="acc-meta">
          <span>{user.email}</span>
          {user.isVerified && (
            <span className="acc-verified"><FiCheckCircle aria-hidden="true" /> Verified</span>
          )}
          {since && <span>Member since {since}</span>}
          {user.role === "admin" && (
            <Link to="/admin" className="acc-link">Admin panel <FiArrowRight aria-hidden="true" /></Link>
          )}
        </p>
      </header>

      {/* ---------- Recent orders ---------- */}
      <section className="acc-section">
        <div className="acc-section-head">
          <h2>Recent orders</h2>
          {orders.list.length > 0 && (
            <Link to="/orders" className="acc-link">View all <FiArrowRight aria-hidden="true" /></Link>
          )}
        </div>
        {orders.loading ? (
          <p className="acc-muted" role="status">Loading orders…</p>
        ) : orders.error ? (
          <p className="acc-msg acc-msg--error" role="alert">{orders.error}</p>
        ) : recent.length === 0 ? (
          <p className="acc-muted">
            You haven't placed any orders yet. <Link to="/filter" className="acc-link">Start shopping</Link>
          </p>
        ) : (
          <ul className="acc-recent">
            {recent.map((o) => {
              const count = itemCount(o);
              return (
                <li key={o._id}>
                  <Link to={`/orders/${o._id}`} className="acc-recent-row">
                    <span className="acc-recent-thumb">
                      {itemImage(o.items?.[0]) ? (
                        <img src={itemImage(o.items[0])} alt="" loading="lazy" />
                      ) : null}
                    </span>
                    <span className="acc-recent-main">
                      <span className="acc-recent-title">
                        #{orderNumber(o._id)}
                        <span className="acc-recent-sub">{itemName(o.items?.[0])}{o.items?.length > 1 ? ` + ${o.items.length - 1} more` : ""}</span>
                      </span>
                      <span className="acc-recent-sub">
                        {formatDate(o.orderDate || o.createdAt)} · {count} {count === 1 ? "item" : "items"}
                      </span>
                    </span>
                    <StatusBadge status={o.orderStatus} />
                    <span className="acc-recent-total">{formatMoney(o.totalAmount)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Account details ---------- */}
      <section className="acc-section">
        <div className="acc-section-head">
          <h2>Account details</h2>
        </div>
        <dl className="acc-dl">
          <div className="acc-dl-row">
            <dt>Name</dt>
            <dd>
              {editingName ? (
                <form className="acc-inline" onSubmit={saveName}>
                  <input
                    type="text"
                    className="acc-input"
                    value={nameDraft}
                    maxLength={60}
                    autoFocus
                    aria-label="Name"
                    onInput={(e) => setNameDraft(e.currentTarget.value)}
                  />
                  <div className="acc-actions">
                    <button type="submit" className="acc-btn acc-btn--primary" disabled={nameStatus.saving}>
                      <FiCheck aria-hidden="true" /> {nameStatus.saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="acc-btn"
                      disabled={nameStatus.saving}
                      onClick={() => {
                        setEditingName(false);
                        setNameStatus({ saving: false, error: "", ok: false });
                      }}
                    >
                      <FiX aria-hidden="true" /> Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="acc-dl-value">
                  <span>{user.name}</span>
                  <button
                    type="button"
                    className="acc-text-btn"
                    onClick={() => {
                      setNameDraft(user.name || "");
                      setEditingName(true);
                      setNameStatus({ saving: false, error: "", ok: false });
                    }}
                  >
                    <FiEdit2 aria-hidden="true" /> Edit
                  </button>
                </div>
              )}
              {nameStatus.error && <p className="acc-msg acc-msg--error" role="alert">{nameStatus.error}</p>}
              {nameStatus.ok && <p className="acc-msg acc-msg--ok" role="status"><FiCheck aria-hidden="true" /> Saved</p>}
            </dd>
          </div>
          <div className="acc-dl-row">
            <dt>Email</dt>
            <dd>
              <div className="acc-dl-value"><span>{user.email}</span></div>
              <p className="acc-hint">Email can't be changed.</p>
            </dd>
          </div>
          <div className="acc-dl-row">
            <dt>Default address</dt>
            <dd>
              <div className="acc-dl-value">
                {defaultAddress ? (
                  <address className="acc-address">
                    {defaultAddress.street}
                    <br />
                    {[defaultAddress.city, defaultAddress.state, defaultAddress.postalCode].filter(Boolean).join(", ")}
                    <br />
                    {defaultAddress.country}
                  </address>
                ) : (
                  <span className="acc-muted">No saved address</span>
                )}
                <Link to="/profile/addresses" className="acc-text-btn">
                  {addresses.length ? "Manage" : "Add address"}
                </Link>
              </div>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

export default ProfilePage;
