// Small helpers shared by the account pages, so the list and details format orders the same way.
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";

// Mongo ids are long; customers read the last 8 chars as the "order number".
export const orderNumber = (id) => (id ? String(id).slice(-8).toUpperCase() : "");

export const formatDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", opts);
};

// Store currency is PKR now; kept the formatMoney name so every account page and checkout switch at once.
// const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
// export const formatMoney = (n) => money.format(Number(n) || 0);
export const formatMoney = formatPrice;

export const ORDER_STATUS = {
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  completed: "Paid",
};

export const PAYMENT_METHOD = {
  // Old values kept: payment rows created before COD/JazzCash/Easypaisa still use them.
  credit_card: "Credit card",
  paypal: "PayPal",
  stripe: "Stripe",
  cod: "Cash on Delivery",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
};

// Order rows say "paid", payment rows say "completed"; treat both as paid so the UI never disagrees with itself.
export const isPaid = (status) => status === "paid" || status === "completed";

// Admin: mark a cash-on-delivery order as paid, via the payment row (PATCH /payments/:id/status).
// Kept in this one function so a future route change touches only here, not the pages.
// `order` needs `_id`; `order.payment._id` is used for the fallback when already known.
export const markOrderPaid = async (order) => {
  const orderId = order?._id;
  // Removed: the backend has no /orders/:id/mark-paid route, so this was a guaranteed 404 on every
  // click before the real path below. Restore it only if that route is ever added.
  // if (orderId) {
  //   try {
  //     const res = await api.patch(`/orders/${orderId}/mark-paid`);
  //     return res.data;
  //   } catch (err) {
  //     // 404 = this route does not exist on the server; anything else is a real error to show.
  //     if (err.response?.status !== 404) throw err;
  //   }
  // }
  let paymentId = order?.payment?._id;
  if (!paymentId && orderId) {
    // The admin order list has no payment attached, so the order detail is the only way to get its id.
    const res = await api.get(`/orders/${orderId}`);
    paymentId = res.data?.payment?._id;
  }
  if (!paymentId) throw new Error("This order has no payment record to mark as paid.");
  const res = await api.patch(`/payments/${paymentId}/status`, { status: "completed" });
  return res.data;
};

// Starts a JazzCash payment for an order: the server signs the fields, then the browser leaves
// our site with a normal form POST to JazzCash's page. Shared by checkout and the order page (retry).
export const startJazzCashPayment = async (orderId) => {
  const res = await api.post("/payments/jazzcash/init", { orderId });
  const { action, fields } = res.data || {};
  if (!action || !fields) throw new Error("Could not start the JazzCash payment.");
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
};

// Server message first; our own thrown Error's message next. Axios's own text ("Request failed
// with status code 500") means nothing to a person, so it falls back instead.
export const errorText = (err, fallback) => {
  if (err?.response) return err.response.data?.message || fallback;
  if (err?.isAxiosError) return fallback;
  return err?.message || fallback;
};

export const itemCount = (order) =>
  (order?.items || []).reduce((sum, i) => sum + (Number(i?.quantity) || 0), 0);

// A product can be deleted after the order was placed, so every read is guarded.
export const itemImage = (item) => item?.product?.images?.[0]?.url || "";
export const itemName = (item) => item?.product?.name || "Product no longer available";
