import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiPrinter, FiArrowLeft, FiDownload } from "react-icons/fi";
import { downloadReceiptPdf } from "../utils/exportFiles";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import { formatSelected } from "../../utils/options";
import { orderNumber, formatDate, PAYMENT_METHOD } from "../../Pages/Account/orderUtils";
import "./../Styles/receipt.css";

// Printable receipt for one order (admin). Rendered OUTSIDE the admin layout on purpose: no sidebar
// or top bar, so "Print / Save as PDF" gives a clean A4 page. Opened in a new tab from Orders.

const STATUS = { processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const PAY_STATUS = { pending: "Pending", paid: "Paid", failed: "Failed", completed: "Paid" };

const OrderReceipt = () => {
  const { orderId } = useParams();
  const [state, setState] = useState({ loading: true, error: "", order: null });
  const [pdf, setPdf] = useState({ busy: false, error: "" });

  useEffect(() => {
    let alive = true;
    api.get(`/reports/receipt/${orderId}`)
      .then((res) => alive && setState({ loading: false, error: "", order: res.data }))
      .catch((err) => alive && setState({ loading: false, error: err.response?.data?.message || "Could not load this order", order: null }));
    return () => { alive = false; };
  }, [orderId]);

  // Tab title becomes the default PDF file name.
  useEffect(() => {
    if (state.order) document.title = `Receipt ${orderNumber(state.order._id)} - ShopZinc`;
    return () => { document.title = "Shopzinc"; };
  }, [state.order]);

  if (state.loading) return <div className="rc-page"><p className="rc-msg">Loading receipt…</p></div>;
  if (state.error) {
    return (
      <div className="rc-page">
        <p className="rc-msg" role="alert">{state.error}</p>
        <p className="rc-msg"><Link to="/admin/orders">Back to orders</Link></p>
      </div>
    );
  }

  const o = state.order;
  const items = o.items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.priceAtTimeOfOrder) || 0) * (Number(it.quantity) || 0), 0);
  const a = o.shippingAddress || {};
  const address = [a.street, a.city, a.state, a.postalCode, a.country].filter(Boolean);
  const method = o.payment?.paymentMethod || o.paymentMethod;
  const payStatus = o.payment?.paymentStatus || o.paymentStatus;

  const downloadPdf = async () => {
    setPdf({ busy: true, error: "" });
    try {
      await downloadReceiptPdf(o, {
        number: orderNumber(o._id),
        status: STATUS[o.orderStatus] || o.orderStatus,
        method: PAYMENT_METHOD[method] || method || "-",
        payStatus: PAY_STATUS[payStatus] || payStatus || "-",
      });
      setPdf({ busy: false, error: "" });
    } catch (err) {
      console.error(err);
      setPdf({ busy: false, error: "Could not create the PDF. Please try again." });
    }
  };

  return (
    <div className="rc-page">
      <div className="rc-toolbar">
        <Link to="/admin/orders" className="rc-btn ghost"><FiArrowLeft aria-hidden="true" /> Orders</Link>
        <div className="rc-toolbar-right">
          <button type="button" className="rc-btn ghost" onClick={() => window.print()}>
            <FiPrinter aria-hidden="true" /> Print
          </button>
          <button type="button" className="rc-btn" onClick={downloadPdf} disabled={pdf.busy}>
            <FiDownload aria-hidden="true" /> {pdf.busy ? "Creating PDF..." : "Download PDF"}
          </button>
        </div>
      </div>
      {pdf.error && <p className="rc-msg" role="alert">{pdf.error}</p>}

      <article className="rc-sheet">
        <header className="rc-head">
          <div>
            <div className="rc-brand">ShopZinc</div>
            <div className="rc-muted">Order receipt</div>
          </div>
          <dl className="rc-meta">
            <div><dt>Receipt no.</dt><dd>#{orderNumber(o._id)}</dd></div>
            <div><dt>Date</dt><dd>{formatDate(o.orderDate || o.createdAt)}</dd></div>
            <div><dt>Status</dt><dd>{STATUS[o.orderStatus] || o.orderStatus}</dd></div>
          </dl>
        </header>

        <section className="rc-parties">
          <div>
            <h3>Billed to</h3>
            <p><strong>{o.user?.name || "Customer"}</strong></p>
            {o.user?.email && <p>{o.user.email}</p>}
          </div>
          <div>
            <h3>Ship to</h3>
            {address.length ? address.map((line, i) => <p key={i}>{line}</p>) : <p className="rc-muted">No address</p>}
          </div>
          <div>
            <h3>Payment</h3>
            <p>{PAYMENT_METHOD[method] || method || "—"}</p>
            <p>{PAY_STATUS[payStatus] || payStatus || "—"}</p>
            {o.payment?.transactionId && <p className="rc-muted">Ref: {o.payment.transactionId}</p>}
          </div>
        </section>

        <table className="rc-items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const qty = Number(it.quantity) || 0;
              const price = Number(it.priceAtTimeOfOrder) || 0;
              return (
                <tr key={it._id || i}>
                  <td>
                    <div className="rc-item-name">{it.product?.name || "Deleted product"}</div>
                    {formatSelected(it.selected) && <div className="rc-muted">{formatSelected(it.selected)}</div>}
                  </td>
                  <td className="num">{qty}</td>
                  <td className="num">{formatPrice(price)}</td>
                  <td className="num">{formatPrice(price * qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="rc-totals">
          <div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
          {/* Order total is what was charged; any difference from the lines (e.g. shipping) shows here. */}
          {Number(o.shippingFee) > 0 && (
            <div><dt>Delivery</dt><dd>{formatPrice(o.shippingFee)}</dd></div>
          )}
          {/* {Math.round(o.totalAmount - subtotal) !== 0 && ( */}
          {/* Delivery has its own line now; anything else left over still shows here. */}
          {Math.round(o.totalAmount - subtotal - (Number(o.shippingFee) || 0)) !== 0 && (
            <div><dt>Other charges</dt><dd>{formatPrice(o.totalAmount - subtotal - (Number(o.shippingFee) || 0))}</dd></div>
          )}
          <div className="rc-grand"><dt>Total</dt><dd>{formatPrice(o.totalAmount)}</dd></div>
        </dl>

        <footer className="rc-foot">Thank you for shopping with ShopZinc.</footer>
      </article>
    </div>
  );
};

export default OrderReceipt;
