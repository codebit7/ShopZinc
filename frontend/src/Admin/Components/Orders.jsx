import React, { useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle, FaClock, FaTimesCircle, FaTruck, FaBan, FaCog, FaTimes, FaSearch,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import { formatSelected } from "../../utils/options";
import { PAYMENT_METHOD, errorText, markOrderPaid } from "../../Pages/Account/orderUtils";
import "./../Styles/orders.css";

// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) =>
//   Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const money = formatPrice;
const date = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const shortId = (id = "") => `#${id.slice(-6).toUpperCase()}`;

const STATUS = {
  processing: { cls: "info", Icon: FaCog, label: "Processing" },
  shipped: { cls: "warning", Icon: FaTruck, label: "Shipped" },
  delivered: { cls: "good", Icon: FaCheckCircle, label: "Delivered" },
  cancelled: { cls: "neutral", Icon: FaBan, label: "Cancelled" },
};
const PAYMENT = {
  pending: { cls: "warning", Icon: FaClock, label: "Pending" },
  paid: { cls: "good", Icon: FaCheckCircle, label: "Paid" },
  failed: { cls: "critical", Icon: FaTimesCircle, label: "Failed" },
};

// Cash is collected by the courier, so only COD needs a manual "paid" step; cancelled orders never get paid.
const canMarkPaid = (o) => o.paymentMethod === "cod" && o.paymentStatus !== "paid" && o.orderStatus !== "cancelled";
const methodLabel = (m) => (m ? PAYMENT_METHOD[m] || m : "—");
// Same rules as the server (shipmentController.bookShipment), so the button only shows when it can work.
// Online orders ship only once paid; old orders with no method were all COD.
const canBook = (o) =>
  o.orderStatus === "processing" &&
  !o.shipment?.trackingNumber &&
  (!o.paymentMethod || o.paymentMethod === "cod" || o.paymentStatus === "paid");

// Colour is never the only signal: every badge carries an icon and a word.
const Badge = ({ map, value }) => {
  const b = map[value] || { cls: "neutral", Icon: FaClock, label: value || "—" };
  return (
    <span className={`adm-badge ${b.cls}`}>
      <b.Icon aria-hidden="true" />
      {b.label}
    </span>
  );
};

const Orders = () => {
  const [orders, setOrders] = useState(null);
  const [users, setUsers] = useState({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [marking, setMarking] = useState({}); // orderId -> { busy, error }
  const [courier, setCourier] = useState({}); // orderId -> { busy, error }
  const [phoneEdit, setPhoneEdit] = useState({}); // orderId -> { value, busy, error }

  useEffect(() => {
    Promise.all([
      // GET /orders answers 404 when there are no orders — that means "empty", not an error.
      api.get("/orders").catch((e) => (e.response?.status === 404 ? { data: [] } : Promise.reject(e))),
      api.get("/users"),
    ])
      .then(([o, u]) => {
        setOrders(Array.isArray(o.data) ? o.data : []);
        // order.user is a bare id (not populated), so map it to name/email here.
        setUsers(Object.fromEntries((u.data.users || []).map((x) => [x._id, x])));
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load orders"));
  }, []);

  const list = orders || [];
  const customer = (o) => users[o.user] || { name: "Unknown customer", email: "" };

  const filtered = useMemo(() => {
    // Ids are shown as "#A1B2C3", so a pasted "#A1B2C3" must match: drop the "#", compare lowercase.
    // const q = search.trim().toLowerCase();
    const q = search.trim().replace(/^#/, "").toLowerCase();
    return list
      .filter((o) => status === "all" || o.orderStatus === status)
      .filter((o) => payment === "all" || o.paymentStatus === payment)
      .filter((o) => {
        if (!q) return true;
        const c = customer(o);
        return [o._id, c.name, c.email].some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt));
  }, [list, users, search, status, payment]);

  // Optimistic: flip the status at once, put the old one back if the server says no.
  const changeStatus = async (order, next) => {
    const prev = order.orderStatus;
    if (next === prev) return;
    setError("");
    setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, orderStatus: next } : o)));
    try {
      await api.patch(`/orders/${order._id}/status`, { status: next });
    } catch (e) {
      setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, orderStatus: prev } : o)));
      setError(e.response?.data?.message || "Could not update the order status");
    }
  };

  const markPaid = async (order) => {
    if (!window.confirm(`Mark order ${shortId(order._id)} as paid? Only do this once the cash is collected.`)) return;
    setMarking((m) => ({ ...m, [order._id]: { busy: true, error: "" } }));
    try {
      await markOrderPaid(order);
    } catch (e) {
      setMarking((m) => ({ ...m, [order._id]: { busy: false, error: errorText(e, "Could not mark this order as paid") } }));
      return;
    }
    try {
      // Re-read the order so the row shows what the server stored, not what we hoped it stored.
      const res = await api.get(`/orders/${order._id}`);
      const fresh = res.data || {};
      setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, paymentStatus: fresh.paymentStatus, payment: fresh.payment } : o)));
      setMarking((m) => ({ ...m, [order._id]: { busy: false, error: "" } }));
    } catch (e) {
      setMarking((m) => ({ ...m, [order._id]: { busy: false, error: "Marked as paid, but the row could not refresh. Reload the page." } }));
    }
  };

  // kind: "ship" books the parcel with PostEx, "track" re-reads its status.
  const courierAction = async (order, kind) => {
    if (kind === "ship" && !window.confirm(`Book order ${shortId(order._id)} with PostEx? A rider will be assigned to pick it up.`)) return;
    setCourier((c) => ({ ...c, [order._id]: { busy: true, error: "" } }));
    try {
      const res = await api.post(`/orders/${order._id}/${kind}`);
      const fresh = res.data || {};
      // Only these fields change; the list's populated items stay as they are.
      setOrders((os) => os.map((o) => (o._id === order._id
        ? { ...o, orderStatus: fresh.orderStatus, paymentStatus: fresh.paymentStatus, deliveryDate: fresh.deliveryDate, shipment: fresh.shipment }
        : o)));
      setCourier((c) => ({ ...c, [order._id]: { busy: false, error: "" } }));
    } catch (e) {
      setCourier((c) => ({ ...c, [order._id]: { busy: false, error: errorText(e, "The courier request failed") } }));
    }
  };

  // Old orders were placed before checkout asked for a phone, and PostEx refuses to book without one.
  // PUT replaces the whole shippingAddress, so the full current address goes up with the new phone.
  const savePhone = async (order) => {
    const value = (phoneEdit[order._id]?.value ?? order.shippingAddress?.phone ?? "").trim();
    setPhoneEdit((p) => ({ ...p, [order._id]: { value, busy: true, error: "" } }));
    try {
      const res = await api.put(`/orders/${order._id}`, { shippingAddress: { ...order.shippingAddress, phone: value } });
      const fresh = res.data || {};
      // Only the address changes; the list's populated items stay as they are.
      setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, shippingAddress: fresh.shippingAddress } : o)));
      setPhoneEdit((p) => ({ ...p, [order._id]: undefined }));
    } catch (e) {
      setPhoneEdit((p) => ({ ...p, [order._id]: { value, busy: false, error: errorText(e, "Could not save the phone number") } }));
    }
  };

  const markButton = (o, extraClass = "") => {
    const m = marking[o._id] || {};
    return (
      <button
        type="button"
        className={`adm-btn secondary sm ${extraClass}`}
        disabled={m.busy}
        onClick={(e) => { e.stopPropagation(); markPaid(o); }}
      >
        {m.busy ? "Saving…" : "Mark as paid"}
      </button>
    );
  };

  const count = (s) => list.filter((o) => o.orderStatus === s).length;
  const revenue = list.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const open = list.find((o) => o._id === openId);

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <h2>Orders</h2>
          <p>Track, filter and update customer orders.</p>
        </div>
      </div>

      <div className="adm-grid-4 ord-stats">
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Total orders</div>
          <div className="adm-stat-value">{list.length}</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Processing</div>
          <div className="adm-stat-value">{count("processing")}</div>
          <div className="adm-stat-note">{count("shipped")} shipped</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Delivered</div>
          <div className="adm-stat-value">{count("delivered")}</div>
          <div className="adm-stat-note">{count("cancelled")} cancelled</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Revenue</div>
          <div className="adm-stat-value">{money(revenue)}</div>
          <div className="adm-stat-note">from paid orders</div>
        </div>
      </div>

      {error && <div className="adm-error">{error}</div>}

      <div className="adm-card">
        <div className="adm-toolbar">
          <label className="adm-search">
            <FaSearch aria-hidden="true" />
            <input
              className="adm-input"
              type="search"
              placeholder="Search order #, customer or email"
              value={search}
              onInput={(e) => setSearch(e.target.value)}
              aria-label="Search orders"
            />
          </label>
          <div className="adm-segmented" role="group" aria-label="Order status">
            {["all", "processing", "shipped", "delivered", "cancelled"].map((s) => (
              <button
                key={s}
                type="button"
                className={status === s ? "active" : ""}
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? "All" : STATUS[s].label}
              </button>
            ))}
          </div>
          <select
            className="adm-select ord-toolbar-select"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            aria-label="Payment status"
          >
            <option value="all">All payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {!orders && !error ? (
          <div className="adm-empty">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">{list.length ? "No orders match these filters." : "No orders yet."}</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Items</th>
                  <th className="num">Total</th>
                  <th>Method</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const c = customer(o);
                  return (
                    <tr
                      key={o._id}
                      className={`ord-row ${openId === o._id ? "is-open" : ""}`}
                      onClick={() => setOpenId(o._id)}
                    >
                      <td className="mono">{shortId(o._id)}</td>
                      <td>{date(o.orderDate || o.createdAt)}</td>
                      <td>
                        {c.name}
                        <span className="ord-sub">{c.email}</span>
                      </td>
                      <td className="num">{(o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)}</td>
                      <td className="num">{money(o.totalAmount)}</td>
                      <td>{methodLabel(o.paymentMethod)}</td>
                      <td>
                        <Badge map={PAYMENT} value={o.paymentStatus} />
                        {marking[o._id]?.error && <span className="ord-mark-error" role="alert">{marking[o._id].error}</span>}
                      </td>
                      <td><Badge map={STATUS} value={o.orderStatus} /></td>
                      <td className="actions">
                        {canMarkPaid(o) && markButton(o, "ord-mark")}
                        <button
                          type="button"
                          className="adm-btn ghost sm"
                          onClick={(e) => { e.stopPropagation(); setOpenId(o._id); }}
                        >
                          View
                        </button>
                      </td>
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
          <div className="ord-backdrop" onClick={() => setOpenId(null)} />
          <aside className="ord-drawer" role="dialog" aria-label={`Order ${shortId(open._id)}`}>
            <div className="ord-drawer-head">
              <h3>
                Order <span className="mono">{shortId(open._id)}</span>
              </h3>
              {/* New tab: the receipt page has no admin chrome, so it prints cleanly. */}
              <Link to={`/admin/receipt/${open._id}`} target="_blank" rel="noopener" className="adm-btn secondary sm ord-receipt-link">
                Receipt
              </Link>
              <button type="button" className="adm-btn ghost icon" onClick={() => setOpenId(null)} aria-label="Close">
                <FaTimes />
              </button>
            </div>
            <div className="ord-drawer-body">
              <div className="ord-section">
                <div className="adm-field">
                  <label className="adm-label" htmlFor="ord-status">Order status</label>
                  <select
                    id="ord-status"
                    className="adm-select"
                    value={open.orderStatus}
                    onChange={(e) => changeStatus(open, e.target.value)}
                  >
                    {Object.entries(STATUS).map(([v, s]) => (
                      <option key={v} value={v}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <p className="adm-muted">
                  Placed {date(open.orderDate || open.createdAt)} · Payment <Badge map={PAYMENT} value={open.paymentStatus} />
                </p>
                <p className="adm-muted">Method: {methodLabel(open.paymentMethod)}</p>
                {canMarkPaid(open) && markButton(open)}
                {marking[open._id]?.error && <p className="ord-mark-error" role="alert">{marking[open._id].error}</p>}
              </div>

              <div className="ord-section">
                <h4>Courier</h4>
                {open.shipment?.trackingNumber ? (
                  <>
                    <div>PostEx · <span className="mono">{open.shipment.trackingNumber}</span></div>
                    <div className="adm-muted">
                      Status: {open.shipment.status || "—"}
                      {open.shipment.lastCheckedAt && ` · checked ${date(open.shipment.lastCheckedAt)}`}
                    </div>
                    {open.orderStatus === "shipped" && (
                      <button
                        type="button"
                        className="adm-btn secondary sm"
                        disabled={courier[open._id]?.busy}
                        onClick={() => courierAction(open, "track")}
                      >
                        {courier[open._id]?.busy ? "Checking…" : "Refresh tracking"}
                      </button>
                    )}
                  </>
                ) : canBook(open) ? (
                  <button
                    type="button"
                    className="adm-btn secondary sm"
                    disabled={courier[open._id]?.busy}
                    onClick={() => courierAction(open, "ship")}
                  >
                    {courier[open._id]?.busy ? "Booking…" : "Book with PostEx"}
                  </button>
                ) : (
                  <div className="adm-muted">
                    {open.orderStatus === "processing" ? "Waiting for the online payment before shipping." : "Not booked with a courier."}
                  </div>
                )}
                {courier[open._id]?.error && <p className="ord-mark-error" role="alert">{courier[open._id].error}</p>}
              </div>

              <div className="ord-section">
                <h4>Customer</h4>
                <div>{customer(open).name}</div>
                <div className="adm-muted">{customer(open).email}</div>
              </div>

              <div className="ord-section">
                <h4>Items</h4>
                {(open.items || []).map((i) => (
                  <div className="ord-line" key={i._id}>
                    {/* product can be null if it was deleted after the order was placed */}
                    {i.product?.images?.[0]?.url ? <img src={i.product.images[0].url} alt="" /> : <span className="ord-thumb" />}
                    <span className="ord-line-name">
                      {i.product?.name || "Deleted product"}
                      {formatSelected(i.selected) && <small className="adm-muted"> · {formatSelected(i.selected)}</small>}
                    </span>
                    <span className="adm-muted">{i.quantity} × {money(i.priceAtTimeOfOrder)}</span>
                  </div>
                ))}
                <div className="ord-total">
                  <span>Total</span>
                  <span>{money(open.totalAmount)}</span>
                </div>
              </div>

              <div className="ord-section">
                <h4>Shipping address</h4>
                {open.shippingAddress?.street ? (
                  <div>
                    {open.shippingAddress.street}
                    <br />
                    {[open.shippingAddress.city, open.shippingAddress.state, open.shippingAddress.postalCode].filter(Boolean).join(", ")}
                    <br />
                    {open.shippingAddress.country}
                    {open.shippingAddress.phone && (<><br />Phone: {open.shippingAddress.phone}</>)}
                    {/* The server checks street/city/country too, so this only shows when an address exists. */}
                    <div className="adm-field">
                      <label className="adm-label" htmlFor="ord-phone">
                        {open.shippingAddress.phone ? "Change phone" : "Add phone (needed for PostEx)"}
                      </label>
                      <input
                        id="ord-phone"
                        className="adm-input"
                        type="tel"
                        placeholder="03001234567"
                        value={phoneEdit[open._id]?.value ?? open.shippingAddress.phone ?? ""}
                        onInput={(e) => setPhoneEdit((p) => ({ ...p, [open._id]: { ...p[open._id], value: e.target.value, error: "" } }))}
                        disabled={phoneEdit[open._id]?.busy}
                      />
                      <button
                        type="button"
                        className="adm-btn secondary sm"
                        disabled={phoneEdit[open._id]?.busy || !(phoneEdit[open._id]?.value ?? "").trim()}
                        onClick={() => savePhone(open)}
                      >
                        {phoneEdit[open._id]?.busy ? "Saving…" : open.shippingAddress.phone ? "Save phone" : "Add phone"}
                      </button>
                      {phoneEdit[open._id]?.error && <p className="ord-mark-error" role="alert">{phoneEdit[open._id].error}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="adm-muted">No address on file.</div>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default Orders;
