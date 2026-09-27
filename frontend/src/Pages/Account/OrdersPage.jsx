import { useEffect, useState } from "preact/hooks";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { FiArrowRight, FiPackage } from "react-icons/fi";
import api from "../../api/client";
import StatusBadge from "./StatusBadge";
import {
  PAYMENT_METHOD, PAYMENT_STATUS, formatDate, formatMoney, itemCount, itemImage, itemName, orderNumber,
} from "./orderUtils";
import "./account.css";
import "./orders.css";

const TABS = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];
const MAX_THUMBS = 4;

const OrdersPage = () => {
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ loading: true, error: "", orders: [] });
  const [tab, setTab] = useState("all");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api
      .get("/orders/me")
      .then((res) => alive && setState({ loading: false, error: "", orders: Array.isArray(res.data) ? res.data : [] }))
      .catch((err) => alive && setState({ loading: false, error: err.response?.data?.message || "Could not load your orders", orders: [] }));
    return () => { alive = false; };
  }, [user?.id, reload]);

  const { loading, error, orders } = state;
  const countFor = (key) => (key === "all" ? orders.length : orders.filter((o) => o.orderStatus === key).length);
  const shown = tab === "all" ? orders : orders.filter((o) => o.orderStatus === tab);

  return (
    <div className="acc-page">
      <header className="acc-head">
        <h1 className="acc-title">Orders</h1>
        <p className="acc-meta">
          <span>Check the status of recent orders and view their details.</span>
        </p>
      </header>

      {loading ? (
        <p className="acc-muted" role="status">Loading your orders…</p>
      ) : error ? (
        <div className="acc-empty">
          <p className="acc-msg acc-msg--error" role="alert">{error}</p>
          <button type="button" className="acc-btn" onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      ) : orders.length === 0 ? (
        <div className="acc-empty">
          <FiPackage className="acc-empty-icon" aria-hidden="true" />
          <p className="acc-empty-title">No orders yet</p>
          <p className="acc-muted">When you place an order, it will show up here.</p>
          <Link to="/filter" className="acc-btn acc-btn--primary">Browse products</Link>
        </div>
      ) : (
        <>
          <div className="ord-tabs" role="tablist" aria-label="Filter orders by status">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`ord-tab${tab === t.key ? " is-active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label} <span className="ord-tab-count">{countFor(t.key)}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="acc-muted ord-none">No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} orders.</p>
          ) : (
            <ul className="ord-list">
              {shown.map((o) => {
                const items = o.items || [];
                const count = itemCount(o);
                const extra = items.length - MAX_THUMBS;
                return (
                  <li key={o._id} className="ord-card">
                    <div className="ord-card-head">
                      <dl className="ord-facts">
                        <div>
                          <dt>Order</dt>
                          <dd>#{orderNumber(o._id)}</dd>
                        </div>
                        <div>
                          <dt>Placed</dt>
                          <dd>{formatDate(o.orderDate || o.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>{formatMoney(o.totalAmount)}</dd>
                        </div>
                        <div>
                          <dt>Payment</dt>
                          <dd>
                            {PAYMENT_STATUS[o.paymentStatus] || o.paymentStatus || "—"}
                            {/* Older orders have no method stored, so nothing is shown for them. */}
                            {o.paymentMethod && (
                              <span className="ord-pay-method">{PAYMENT_METHOD[o.paymentMethod] || o.paymentMethod}</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      <Link to={`/orders/${o._id}`} className="acc-btn ord-view">
                        View details <FiArrowRight aria-hidden="true" />
                      </Link>
                    </div>
                    <div className="ord-card-body">
                      <div className="ord-card-status">
                        <StatusBadge status={o.orderStatus} />
                        <span className="acc-muted">
                          {count} {count === 1 ? "item" : "items"} · {itemName(items[0])}
                          {items.length > 1 ? ` and ${items.length - 1} more` : ""}
                        </span>
                      </div>
                      <ul className="ord-thumbs" aria-label="Items in this order">
                        {items.slice(0, MAX_THUMBS).map((it, i) => (
                          <li key={it._id || i} className="ord-thumb" title={itemName(it)}>
                            {itemImage(it) ? <img src={itemImage(it)} alt={itemName(it)} loading="lazy" /> : null}
                          </li>
                        ))}
                        {extra > 0 && <li className="ord-thumb ord-thumb--more">+{extra}</li>}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default OrdersPage;
