import { useEffect, useState } from "preact/hooks";
import { useSelector } from "react-redux";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiCheck, FiCheckCircle, FiX, FiXCircle } from "react-icons/fi";
import api from "../../api/client";
import StatusBadge from "./StatusBadge";
import { formatSelected } from "../../utils/options";
import {
  PAYMENT_METHOD, PAYMENT_STATUS, formatDate, isPaid, formatMoney, itemImage, itemName, orderNumber,
  startJazzCashPayment, errorText,
} from "./orderUtils";
import "./account.css";
import "./orders.css";

const STEPS = ["Placed", "Processing", "Shipped", "Delivered"];
// Index of the step the order has reached. "Placed" is always done once the order exists.
const REACHED = { processing: 1, shipped: 2, delivered: 3 };
// ?payment=... is set by the server after JazzCash sends the buyer back.
const PAY_RESULT = {
  success: { ok: true, text: "Payment received. Thank you!" },
  pending: { ok: true, text: "Your payment is still being processed. This page will show it once JazzCash confirms." },
  failed: { ok: false, text: "The payment did not go through. You can try again below." },
  error: { ok: false, text: "We could not read the payment result. Please check this page again in a few minutes." },
};
const COURIER_NAME = { postex: "PostEx" };

const OrderDetailsPage = () => {
  const { orderId } = useParams();
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ loading: true, error: "", status: 0, order: null });
  const [cancel, setCancel] = useState({ busy: false, error: "" });
  const [paying, setPaying] = useState({ busy: false, error: "" });
  const [reload, setReload] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  // Copied out of router state so the banner survives the state being cleared just below.
  const [justPlaced, setJustPlaced] = useState(!!location.state?.justPlaced);
  const [payResult] = useState(() => PAY_RESULT[new URLSearchParams(location.search).get("payment")] || null);

  // History state outlives a refresh; clear it now so a reload does not show "order placed" again.
  useEffect(() => {
    // Same for ?payment=: a reload must not repeat "payment received".
    if (location.state?.justPlaced || location.search) navigate(location.pathname, { replace: true, state: null });
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api
      .get(`/orders/${orderId}`)
      .then((res) => alive && setState({ loading: false, error: "", status: 200, order: res.data }))
      .catch((err) =>
        alive &&
        setState({
          loading: false,
          status: err.response?.status || 0,
          error: err.response?.data?.message || "Could not load this order",
          order: null,
        })
      );
    return () => { alive = false; };
  }, [orderId, user?.id, reload]);

  // PageTitle has no entry for /orders/:id and would say "Page not found".
  useEffect(() => {
    document.title = state.order ? `Order #${orderNumber(state.order._id)} | Shopzinc` : "Order | Shopzinc";
  }, [state.order?._id]);

  const back = (
    <Link to="/orders" className="acc-link ord-back">
      <FiArrowLeft aria-hidden="true" /> Back to orders
    </Link>
  );

  const placedBanner = justPlaced ? (
    <div className="ord-placed" role="status">
      <FiCheckCircle className="ord-placed-icon" aria-hidden="true" />
      <p className="ord-placed-text">
        Thank you — your order is placed. <strong>Order #{orderNumber(orderId)}</strong>
      </p>
      <button type="button" className="ord-placed-close" onClick={() => setJustPlaced(false)} aria-label="Dismiss">
        <FiX aria-hidden="true" />
      </button>
    </div>
  ) : null;

  if (state.loading && !state.order) {
    return <div className="acc-page">{back}{placedBanner}<p className="acc-muted" role="status">Loading order…</p></div>;
  }

  if (!state.order) {
    // 404 = no such order, 403 = someone else's, 500 = usually a malformed id (cast error).
    const missing = [400, 403, 404, 500].includes(state.status);
    return (
      <div className="acc-page">
        {back}
        <div className="acc-empty">
          <p className="acc-empty-title">{missing ? "Order not found" : "Something went wrong"}</p>
          <p className="acc-muted">
            {missing ? "This order doesn't exist or isn't on your account." : state.error}
          </p>
          {!missing && (
            <button type="button" className="acc-btn" onClick={() => setReload((n) => n + 1)}>Try again</button>
          )}
        </div>
      </div>
    );
  }

  const o = state.order;
  const items = o.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.priceAtTimeOfOrder) || 0) * (Number(i.quantity) || 0), 0);
  const total = Number(o.totalAmount) || 0;
  // totalAmount comes from the client today (BUG-28), so show any gap honestly instead of hiding it.
  const adjustment = Math.round((total - subtotal) * 100) / 100;
  // Delivery has its own line; only what is left after it shows as an adjustment.
  const shippingFee = Number(o.shippingFee) || 0;
  const otherCharges = Math.round((adjustment - shippingFee) * 100) / 100;
  const cancelled = o.orderStatus === "cancelled";
  const reached = REACHED[o.orderStatus] ?? 0;
  const addr = o.shippingAddress || {};
  const hasAddr = [addr.street, addr.city, addr.country].some(Boolean);
  const pay = o.payment;
  // New orders store the method on the order; older ones only have it on the payment record.
  const method = o.paymentMethod || pay?.paymentMethod;
  const orderPaid = isPaid(o.paymentStatus);
  // Only worth a second line when the payment record says something different from the order.
  const recordDiffers = pay && isPaid(pay.paymentStatus) !== orderPaid;
  const payBadge = orderPaid ? "paid" : o.paymentStatus === "failed" ? "failed" : "pending";

  const ship = o.shipment || {};
  const canPay = method === "jazzcash" && !orderPaid && !cancelled;

  const payNow = async () => {
    setPaying({ busy: true, error: "" });
    try {
      await startJazzCashPayment(o._id); // leaves the page on success
    } catch (err) {
      setPaying({ busy: false, error: errorText(err, "Could not start the payment") });
    }
  };

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order? This can't be undone.")) return;
    setCancel({ busy: true, error: "" });
    try {
      await api.post(`/orders/${o._id}/cancel`);
      setCancel({ busy: false, error: "" });
      setReload((n) => n + 1); // refetch so status, timeline and button all come from the server
    } catch (err) {
      setCancel({ busy: false, error: err.response?.data?.message || "Could not cancel this order" });
    }
  };

  return (
    <div className="acc-page">
      {back}
      {placedBanner}

      <header className="acc-head acc-head--row">
        <div>
          <h1 className="acc-title">Order #{orderNumber(o._id)}</h1>
          <p className="acc-meta">
            <span>Placed {formatDate(o.orderDate || o.createdAt, { month: "long", day: "numeric", year: "numeric" })}</span>
            <StatusBadge status={o.orderStatus} />
          </p>
        </div>
        {/* {o.orderStatus === "processing" && (
          <button type="button" className="acc-btn acc-btn--danger" onClick={cancelOrder} disabled={cancel.busy}>
            {cancel.busy ? "Cancelling…" : "Cancel order"}
          </button>
        )} */}
        {/* Paid online: the server refuses a self-cancel (no refund API), so point to the store instead.
            Reads o.paymentMethod like the server does; missing = cod. */}
        {o.orderStatus === "processing" && (
          o.paymentMethod && o.paymentMethod !== "cod" && o.paymentStatus === "paid" ? (
            <p className="acc-muted">
              Paid online — <Link to="/contact" className="acc-link">contact us</Link> to cancel this order.
            </p>
          ) : (
            <button type="button" className="acc-btn acc-btn--danger" onClick={cancelOrder} disabled={cancel.busy}>
              {cancel.busy ? "Cancelling…" : "Cancel order"}
            </button>
          )
        )}
      </header>
      {cancel.error && <p className="acc-msg acc-msg--error" role="alert">{cancel.error}</p>}
      {payResult && (
        <p className={`acc-msg ${payResult.ok ? "acc-msg--ok" : "acc-msg--error"}`} role="status">{payResult.text}</p>
      )}

      {/* ---------- Progress ---------- */}
      <section className="acc-section">
        {cancelled ? (
          <div className="ord-cancelled">
            <FiXCircle aria-hidden="true" />
            <div>
              <p className="ord-cancelled-title">This order was cancelled</p>
              <p className="acc-muted">It won't be shipped.{o.updatedAt ? ` Last updated ${formatDate(o.updatedAt)}.` : ""}</p>
            </div>
          </div>
        ) : (
          <ol className="ord-steps" aria-label="Order progress">
            {STEPS.map((label, i) => {
              const done = i < reached || (i === reached && i === STEPS.length - 1);
              const current = i === reached && !done;
              // Only these two dates are stored; the model has no per-step timestamps.
              const date = i === 0 ? formatDate(o.orderDate || o.createdAt) : i === 3 && o.deliveryDate ? formatDate(o.deliveryDate) : "";
              return (
                <li
                  key={label}
                  className={`ord-step${done ? " is-done" : ""}${current ? " is-current" : ""}${i < reached ? " is-linked" : ""}`}
                  aria-current={current ? "step" : undefined}
                >
                  <span className="ord-step-dot" aria-hidden="true">{done ? <FiCheck /> : null}</span>
                  <span className="ord-step-label">{label}</span>
                  {date && <span className="ord-step-date">{date}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="ord-detail-grid">
        {/* ---------- Items ---------- */}
        <section className="acc-section ord-items-section">
          <div className="acc-section-head">
            <h2>Items</h2>
          </div>
          <ul className="ord-items">
            {items.map((it, i) => {
              const price = Number(it.priceAtTimeOfOrder) || 0;
              const qty = Number(it.quantity) || 0;
              const pid = it.product?._id;
              return (
                <li key={it._id || i} className="ord-item">
                  <span className="ord-item-img">
                    {itemImage(it) ? <img src={itemImage(it)} alt="" loading="lazy" /> : null}
                  </span>
                  <div className="ord-item-main">
                    {pid ? (
                      <Link to={`/product/${pid}`} className="ord-item-name">{itemName(it)}</Link>
                    ) : (
                      <span className="ord-item-name">{itemName(it)}</span>
                    )}
                    {formatSelected(it.selected) && <span className="acc-muted">{formatSelected(it.selected)}</span>}
                    <span className="acc-muted">Qty {qty} · {formatMoney(price)} each</span>
                  </div>
                  <span className="ord-item-total">{formatMoney(price * qty)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="ord-aside">
          {/* ---------- Summary ---------- */}
          <section className="acc-section">
            <div className="acc-section-head"><h2>Summary</h2></div>
            <dl className="ord-sum">
              <div><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
              {shippingFee > 0 && (
                <div><dt>Delivery</dt><dd>{formatMoney(shippingFee)}</dd></div>
              )}
              {/* {adjustment !== 0 && (
                <div><dt>Shipping, tax & adjustments</dt><dd>{adjustment > 0 ? "" : "−"}{formatMoney(Math.abs(adjustment))}</dd></div> */}
              {otherCharges !== 0 && (
                <div><dt>Other adjustments</dt><dd>{otherCharges > 0 ? "" : "−"}{formatMoney(Math.abs(otherCharges))}</dd></div>
              )}
              <div className="ord-sum-total"><dt>Total</dt><dd>{formatMoney(total)}</dd></div>
            </dl>
          </section>

          {/* ---------- Shipping ---------- */}
          <section className="acc-section">
            <div className="acc-section-head"><h2>Shipping address</h2></div>
            {hasAddr ? (
              <address className="acc-address">
                {addr.street}
                <br />
                {[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}
                <br />
                {addr.country}
              </address>
            ) : (
              <p className="acc-muted">No address on this order.</p>
            )}
            {addr.phone && <p className="acc-muted">Phone: {addr.phone}</p>}
            {ship.trackingNumber ? (
              <dl className="ord-sum">
                <div><dt>Courier</dt><dd>{COURIER_NAME[ship.courier] || ship.courier || "—"}</dd></div>
                <div><dt>Tracking #</dt><dd className="ord-mono">{ship.trackingNumber}</dd></div>
                {ship.status && <div><dt>Courier status</dt><dd>{ship.status}</dd></div>}
              </dl>
            ) : (
              !cancelled && o.orderStatus !== "delivered" && (
                <p className="acc-muted ord-sum-note">A tracking number appears here once your order is handed to the courier.</p>
              )
            )}
          </section>

          {/* ---------- Payment ---------- */}
          <section className="acc-section">
            {/* Replaced by the method/status/amount layout below (COD + wallets).
            // <div className="acc-section-head"><h2>Payment</h2></div>
            // <dl className="ord-sum">
            // <div><dt>Order payment</dt><dd>{PAYMENT_STATUS[o.paymentStatus] || o.paymentStatus || "—"}</dd></div>
            // {pay ? (
            // <>
            // <div><dt>Method</dt><dd>{PAYMENT_METHOD[pay.paymentMethod] || pay.paymentMethod}</dd></div>
            // <div><dt>Payment record</dt><dd>{PAYMENT_STATUS[pay.paymentStatus] || pay.paymentStatus}</dd></div>
            // <div><dt>Amount</dt><dd>{formatMoney(pay.amount)}</dd></div>
            // {pay.paymentDate && <div><dt>Date</dt><dd>{formatDate(pay.paymentDate)}</dd></div>}
            // {pay.transactionId && (
            // <div><dt>Transaction</dt><dd className="ord-mono">{pay.transactionId}</dd></div>
            // )}
            // </>
            // ) : null}
            // </dl>
            // {!pay && <p className="acc-muted ord-sum-note">No payment recorded.</p>}
            */}
            <div className="acc-section-head"><h2>Payment</h2></div>
            <dl className="ord-sum">
              <div><dt>Method</dt><dd>{method ? PAYMENT_METHOD[method] || method : "—"}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`ord-badge ord-pay--${payBadge}`}>
                    <span className="ord-badge-dot" aria-hidden="true" />
                    {PAYMENT_STATUS[o.paymentStatus] || o.paymentStatus || "Unknown"}
                  </span>
                </dd>
              </div>
              {recordDiffers && (
                <div><dt>Payment record</dt><dd>{PAYMENT_STATUS[pay.paymentStatus] || pay.paymentStatus}</dd></div>
              )}
              <div><dt>Amount</dt><dd>{formatMoney(pay ? pay.amount : o.totalAmount)}</dd></div>
              {/* "Date", not "Paid on": the record's paymentDate is set when it is created, not when cash is collected. */}
              {pay?.paymentDate && <div><dt>Date</dt><dd>{formatDate(pay.paymentDate)}</dd></div>}
              {pay?.transactionId && (
                <div><dt>Transaction</dt><dd className="ord-mono">{pay.transactionId}</dd></div>
              )}
            </dl>
            {method === "cod" && !orderPaid && !cancelled && (
              <p className="acc-muted ord-sum-note">Pay in cash when your order is delivered.</p>
            )}
            {canPay && (
              <>
                <button type="button" className="acc-btn acc-btn--primary" onClick={payNow} disabled={paying.busy}>
                  {paying.busy ? "Opening JazzCash…" : "Pay with JazzCash"}
                </button>
                {paying.error && <p className="acc-msg acc-msg--error" role="alert">{paying.error}</p>}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default OrderDetailsPage;
