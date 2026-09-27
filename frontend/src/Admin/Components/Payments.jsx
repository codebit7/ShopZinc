import React, { useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle, FaClock, FaTimesCircle, FaSearch, FaCreditCard, FaPaypal, FaStripe,
  FaMoneyBillWave, FaMobileAlt,
} from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import { errorText, markOrderPaid } from "../../Pages/Account/orderUtils";
import "./../Styles/orders.css";

// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) =>
//   Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const money = formatPrice;
const date = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const shortId = (id = "") => `#${id.slice(-6).toUpperCase()}`;

const STATUS = {
  pending: { cls: "warning", Icon: FaClock, label: "Pending" },
  completed: { cls: "good", Icon: FaCheckCircle, label: "Completed" },
  failed: { cls: "critical", Icon: FaTimesCircle, label: "Failed" },
};
const METHOD = {
  credit_card: { Icon: FaCreditCard, label: "Credit card" },
  paypal: { Icon: FaPaypal, label: "PayPal" },
  stripe: { Icon: FaStripe, label: "Stripe" },
  // Generic icons on purpose: no hand-drawn JazzCash/Easypaisa logos.
  cod: { Icon: FaMoneyBillWave, label: "Cash on Delivery" },
  jazzcash: { Icon: FaMobileAlt, label: "JazzCash" },
  easypaisa: { Icon: FaMobileAlt, label: "Easypaisa" },
};

// Colour is never the only signal: the badge carries an icon and a word.
const Badge = ({ value }) => {
  const b = STATUS[value] || { cls: "neutral", Icon: FaClock, label: value || "—" };
  return (
    <span className={`adm-badge ${b.cls}`}>
      <b.Icon aria-hidden="true" />
      {b.label}
    </span>
  );
};

const Payments = () => {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [marking, setMarking] = useState({}); // paymentId -> { busy, error }

  // useEffect(() => {
  //   api
  //     .get("/payments")
  //     .then((r) => setPayments(Array.isArray(r.data) ? r.data : []))
  //     .catch((e) => setError(e.response?.data?.message || "Could not load payments"));
  // }, []);
  // Named so "Mark as paid" can reload the list after the server changes it.
  const load = () =>
    api
      .get("/payments")
      .then((r) => setPayments(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.message || "Could not load payments"));

  useEffect(() => {
    load();
  }, []);

  const list = payments || [];

  const filtered = useMemo(() => {
    // Ids are shown as "#A1B2C3", so a pasted "#A1B2C3" must match: drop the "#", compare lowercase.
    // const q = search.trim().toLowerCase();
    const q = search.trim().replace(/^#/, "").toLowerCase();
    return list
      .filter((p) => status === "all" || p.paymentStatus === status)
      .filter((p) => {
        if (!q) return true;
        // user/order are populated objects, but can be null if either was deleted.
        return [p._id, p.transactionId, p.order?._id, p.user?.name, p.user?.email]
          .some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));
  }, [list, search, status]);

  // Optimistic: flip the status at once, put the old one back if the server says no.
  const changeStatus = async (payment, next) => {
    const prev = payment.paymentStatus;
    if (next === prev) return;
    setError("");
    setPayments((ps) => ps.map((p) => (p._id === payment._id ? { ...p, paymentStatus: next } : p)));
    try {
      await api.patch(`/payments/${payment._id}/status`, { status: next });
    } catch (e) {
      setPayments((ps) => ps.map((p) => (p._id === payment._id ? { ...p, paymentStatus: prev } : p)));
      setError(e.response?.data?.message || "Could not update the payment status");
    }
  };

  // Same helper as the Orders page, so both screens use the one backend route.
  const markPaid = async (p) => {
    if (!window.confirm(`Mark payment ${shortId(p._id)} as paid? Only do this once the cash is collected.`)) return;
    setMarking((m) => ({ ...m, [p._id]: { busy: true, error: "" } }));
    try {
      // p.order is populated (or null if the order was deleted); the payment id makes the fallback route work either way.
      await markOrderPaid({ _id: p.order?._id, payment: { _id: p._id } });
      setMarking((m) => ({ ...m, [p._id]: { busy: false, error: "" } }));
      load();
    } catch (e) {
      setMarking((m) => ({ ...m, [p._id]: { busy: false, error: errorText(e, "Could not mark this payment as paid") } }));
    }
  };

  const collected = list.filter((p) => p.paymentStatus === "completed").reduce((s, p) => s + (p.amount || 0), 0);
  const count = (s) => list.filter((p) => p.paymentStatus === s).length;

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <h2>Payments</h2>
          <p>Payment records for customer orders.</p>
        </div>
      </div>

      <div className="adm-grid-3 ord-stats">
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Total collected</div>
          <div className="adm-stat-value">{money(collected)}</div>
          <div className="adm-stat-note">{count("completed")} completed</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Pending</div>
          <div className="adm-stat-value">{count("pending")}</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Failed</div>
          <div className="adm-stat-value">{count("failed")}</div>
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
              placeholder="Search payment, order, customer"
              value={search}
              onInput={(e) => setSearch(e.target.value)}
              aria-label="Search payments"
            />
          </label>
          <div className="adm-segmented" role="group" aria-label="Payment status">
            {["all", "pending", "completed", "failed"].map((s) => (
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
        </div>

        {!payments && !error ? (
          <div className="adm-empty">Loading payments…</div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">{list.length ? "No payments match these filters." : "No payments yet."}</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th className="actions">Change</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const m = METHOD[p.paymentMethod] || { Icon: FaCreditCard, label: p.paymentMethod };
                  return (
                    <tr key={p._id}>
                      <td className="mono">
                        {shortId(p._id)}
                        {p.transactionId && <span className="ord-sub">{p.transactionId}</span>}
                      </td>
                      <td>{date(p.paymentDate || p.createdAt)}</td>
                      <td>
                        {p.user?.name || "Unknown customer"}
                        <span className="ord-sub">{p.user?.email}</span>
                      </td>
                      <td className="mono">{p.order ? shortId(p.order._id) : "—"}</td>
                      <td className="ord-method"><m.Icon aria-hidden="true" />{m.label}</td>
                      <td className="num">{money(p.amount)}</td>
                      <td><Badge value={p.paymentStatus} /></td>
                      <td className="actions">
                        {p.paymentMethod === "cod" && p.paymentStatus !== "completed" && (
                          <button
                            type="button"
                            className="adm-btn secondary sm ord-mark"
                            disabled={marking[p._id]?.busy}
                            onClick={() => markPaid(p)}
                          >
                            {marking[p._id]?.busy ? "Saving…" : "Mark as paid"}
                          </button>
                        )}
                        <select
                          className="adm-select ord-toolbar-select"
                          value={p.paymentStatus}
                          onChange={(e) => changeStatus(p, e.target.value)}
                          aria-label={`Change status of payment ${shortId(p._id)}`}
                        >
                          {Object.entries(STATUS).map(([v, s]) => (
                            <option key={v} value={v}>{s.label}</option>
                          ))}
                        </select>
                        {marking[p._id]?.error && <span className="ord-mark-error" role="alert">{marking[p._id].error}</span>}
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

export default Payments;
