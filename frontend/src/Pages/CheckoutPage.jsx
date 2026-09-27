import { useEffect, useState } from "preact/hooks";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiCreditCard, FiInfo, FiLock, FiMapPin, FiPhone, FiShoppingBag, FiSmartphone, FiTruck } from "react-icons/fi";
import { LuWallet } from "react-icons/lu";
import api from "../api/client";
import { getCartItems } from "../Store/slices/cartSlice";
import { fetchMe, updateMe } from "../Store/slices/authSlice";
import { formatMoney, startJazzCashPayment } from "./Account/orderUtils";
import { formatSelected, extraForSelected } from "../utils/options";
import "./Account/account.css";
import "./checkoutPage.css";

// Same shape and limit as AddressesPage, so a checkout save can't send something the address book rejects.
const EMPTY_ADDRESS = { street: "", city: "", state: "", postalCode: "", country: "" };
const MAX_ADDRESSES = 5;
const NEW = "new";
// Same rule as the server (utils/postex.js normalizePhone): the courier only takes 03xxxxxxxxx.
const PHONE_RE = /^(\+92|92|0)3\d{9}$/;

const toPayload = (a) => ({
  street: a.street || "",
  city: a.city || "",
  state: a.state || "",
  postalCode: a.postalCode || "",
  country: a.country || "",
  isDefault: !!a.isDefault,
});

// Only the fields the orders API reads; isDefault/_id would just be noise in the order.
const toOrderAddress = (a) => ({
  street: (a.street || "").trim(),
  city: (a.city || "").trim(),
  state: (a.state || "").trim(),
  postalCode: (a.postalCode || "").trim(),
  country: (a.country || "").trim(),
});

// discount is a percent (BUG-62). Display only — the server computes the real total.
// selected: the line's choices, whose extra price is part of the price (same rule as the server).
const unitPrice = (p, selected) => {
  // const price = Number(p?.price) || 0;
  const price = (Number(p?.price) || 0) + extraForSelected(p, selected);
  const d = Number(p?.discount) || 0;
  return d > 0 ? price * (1 - d / 100) : price;
};

// Used when GET /payments/methods fails: COD needs no gateway, so it is always safe to offer.
const FALLBACK_METHODS = [{ id: "cod", label: "Cash on Delivery", enabled: true }];
const METHOD_ICON = { cod: FiTruck, jazzcash: FiSmartphone, easypaisa: LuWallet };
const METHOD_HELP = {
  cod: "Pay in cash when your order arrives.",
  jazzcash: "Pay from your JazzCash mobile account.",
  easypaisa: "Pay from your Easypaisa mobile account.",
};

// COD first when it is on, so the common case needs no click.
const pickDefault = (list) => {
  const on = list.filter((m) => m.enabled);
  return (on.find((m) => m.id === "cod") || on[0])?.id || null;
};

const CheckoutPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const cart = useSelector((s) => s.cart);

  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState(null); // saved address _id, or NEW
  const [draft, setDraft] = useState(EMPTY_ADDRESS);
  const [saveNew, setSaveNew] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [methods, setMethods] = useState(null); // null = still loading
  const [methodsFailed, setMethodsFailed] = useState(false);
  const [payMethod, setPayMethod] = useState("cod");
  // Not part of the saved address: the courier needs it for this delivery only.
  const [phone, setPhone] = useState("");

  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
  const items = Array.isArray(cart.items) ? cart.items : [];

  // The cart in redux may be stale (another tab, a stock change); checkout must show what the server will charge.
  useEffect(() => {
    let alive = true;
    dispatch(getCartItems()).finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [dispatch]);

  // Which methods are live is decided on the server (gateway keys set or not), so ask it.
  useEffect(() => {
    let alive = true;
    api
      .get("/payments/methods")
      .then((res) => {
        if (!alive) return;
        const list = (Array.isArray(res.data) ? res.data : []).filter((m) => m && m.id);
        const usable = list.length ? list : FALLBACK_METHODS;
        setMethods(usable);
        setPayMethod(pickDefault(usable));
      })
      .catch(() => {
        if (!alive) return;
        setMethods(FALLBACK_METHODS);
        setMethodsFailed(true);
        setPayMethod("cod");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Preselect once addresses are known: default first, else the first one, else the new-address form.
  useEffect(() => {
    if (choice !== null) return;
    if (!user) return;
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    setChoice(def ? def._id : NEW);
  }, [user, addresses, choice]);

  // Older cart payloads have no subtotal/discount; fall back so the summary never shows NaN.
  const subtotal =
    typeof cart.subtotal === "number"
      ? cart.subtotal
      : items.reduce((s, i) => s + (Number(i?.product?.price) || 0) * (Number(i?.quantity) || 0), 0);
  const discount = typeof cart.discount === "number" ? cart.discount : 0;
  // const total = Number(cart.total) || 0;
  // Items + delivery, as the server will charge it (createOrder uses the same fee rule).
  const shippingFee = Number(cart.shippingFee) || 0;
  const total = Number(cart.grandTotal) || Number(cart.total) || 0;
  const count = items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0);

  const canSave = addresses.length < MAX_ADDRESSES;

  const placeOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const picked = choice === NEW ? draft : addresses.find((a) => a._id === choice);
    if (!picked) {
      setError("Please choose a shipping address.");
      return;
    }
    const address = toOrderAddress(picked);
    if (!address.street || !address.city || !address.country) {
      setError("Street, city and country are required.");
      return;
    }
    if (!PHONE_RE.test(phone.replace(/[\s-]/g, ""))) {
      setError("Please add a valid mobile number, like 03001234567. The courier calls this number.");
      return;
    }
    address.phone = phone.trim();

    if (!payMethod) {
      setError("Please choose a payment method.");
      return;
    }

    setSubmitting(true);

    // Save first: once the order is placed we navigate away and a failed save would be lost silently.
    if (choice === NEW && saveNew && canSave) {
      const next = [...addresses.map(toPayload), { ...address, isDefault: addresses.length === 0 }];
      const res = await dispatch(updateMe({ addresses: next }));
      if (!updateMe.fulfilled.match(res)) {
        setError(`${res.payload || "Could not save the address"}. Untick "Save to my addresses" to order anyway.`);
        setSubmitting(false);
        return;
      }
    }

    try {
      // const res = await api.post("/orders", { address });
      const res = await api.post("/orders", { address, paymentMethod: payMethod });
      const order = res.data?.order;
      // Placing an order empties the cart and adds to order history, so both need a reload.
      dispatch(getCartItems());
      dispatch(fetchMe());
      if (order?._id && payMethod === "jazzcash") {
        // The order exists (stock is held), so a failed hand-off still leaves it on /orders with a "Pay" button.
        try {
          await startJazzCashPayment(order._id);
          return; // the browser is leaving for JazzCash
        } catch {
          navigate(`/orders/${order._id}`, { replace: true, state: { justPlaced: true } });
          return;
        }
      }
      if (order?._id) {
        navigate(`/orders/${order._id}`, { replace: true, state: { justPlaced: true } });
      } else {
        navigate("/orders", { replace: true });
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 409) {
        // Stock changed since the cart loaded; reload so the summary shows what is really left.
        setError(msg || "Some items are no longer available in that quantity.");
        dispatch(getCartItems());
      } else if (status === 400 && msg) {
        setError(msg);
      } else if (status === 401) {
        setError("Your session has ended. Please log in again.");
      } else {
        setError("Could not place your order. Please check your connection and try again.");
      }
      setSubmitting(false);
    }
  };

  if (!loaded && items.length === 0) {
    return (
      <div className="ck container">
        <div className="acc-loading" role="status">Loading your cart…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ck container">
        <div className="acc-empty ck-empty">
          <FiShoppingBag className="acc-empty-icon" aria-hidden="true" />
          <p className="acc-empty-title">Your cart is empty</p>
          <p className="acc-muted">Add a few products before checking out.</p>
          <Link to="/filter" className="acc-btn acc-btn--primary">Browse products</Link>
        </div>
      </div>
    );
  }

  const field = (key, label, opts = {}) => (
    <label className={`acc-field${opts.wide ? " acc-field--wide" : ""}`}>
      <span>
        {label}
        {opts.required && <em aria-hidden="true"> *</em>}
      </span>
      <input
        type="text"
        className="acc-input"
        name={key}
        value={draft[key]}
        required={opts.required}
        maxLength={120}
        autoComplete={opts.autoComplete}
        disabled={submitting}
        onInput={(e) => setDraft((d) => ({ ...d, [key]: e.currentTarget.value }))}
      />
    </label>
  );

  return (
    <div className="ck container">
      <header className="ck-head">
        <Link to="/cart" className="acc-link">
          <FiArrowLeft aria-hidden="true" /> Back to cart
        </Link>
        <h1 className="acc-title">Checkout</h1>
      </header>

      {/* One form so the new-address fields get native "required" checks from the Place order button. */}
      <form className="ck-grid" onSubmit={placeOrder}>
        <div className="ck-steps">
          <section className="acc-section ck-step" aria-labelledby="ck-ship">
            <h2 id="ck-ship" className="ck-step-title">
              <span className="ck-step-num" aria-hidden="true">1</span>
              <FiMapPin aria-hidden="true" /> Shipping address
            </h2>

            <fieldset className="ck-fieldset" disabled={submitting}>
              <legend className="ck-sr">Choose a shipping address</legend>
              <ul className="ck-options">
                {addresses.map((a) => (
                  <li key={a._id}>
                    <label className={`ck-option${choice === a._id ? " is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="ck-address"
                        value={a._id}
                        checked={choice === a._id}
                        onChange={() => setChoice(a._id)}
                      />
                      <address className="acc-address">
                        <strong>{a.street}</strong>
                        {a.isDefault && <span className="ck-tag">Default</span>}
                        <br />
                        {[a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
                        <br />
                        {a.country}
                      </address>
                    </label>
                  </li>
                ))}
                <li>
                  <label className={`ck-option${choice === NEW ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="ck-address"
                      value={NEW}
                      checked={choice === NEW}
                      onChange={() => setChoice(NEW)}
                    />
                    <span className="ck-option-text">Use a new address</span>
                  </label>
                </li>
              </ul>
            </fieldset>

            {choice === NEW && (
              <div className="ck-new">
                <div className="acc-form-grid">
                  {field("street", "Street", { required: true, wide: true, autoComplete: "street-address" })}
                  {field("city", "City", { required: true, autoComplete: "address-level2" })}
                  {field("state", "State / Province", { autoComplete: "address-level1" })}
                  {field("postalCode", "Postal code", { autoComplete: "postal-code" })}
                  {field("country", "Country", { required: true, autoComplete: "country-name" })}
                </div>
                {canSave ? (
                  <label className="acc-check">
                    <input
                      type="checkbox"
                      checked={saveNew}
                      disabled={submitting}
                      onChange={(e) => setSaveNew(e.currentTarget.checked)}
                    />
                    Save to my addresses
                  </label>
                ) : (
                  <p className="acc-hint">Your address book is full ({MAX_ADDRESSES}), so this one is used for this order only.</p>
                )}
              </div>
            )}

            <div className="ck-new">
              <div className="acc-form-grid">
                <label className="acc-field">
                  <span>
                    <FiPhone aria-hidden="true" /> Mobile number<em aria-hidden="true"> *</em>
                  </span>
                  <input
                    type="tel"
                    className="acc-input"
                    name="phone"
                    value={phone}
                    required
                    maxLength={16}
                    placeholder="03001234567"
                    autoComplete="tel"
                    disabled={submitting}
                    onInput={(e) => setPhone(e.currentTarget.value)}
                  />
                </label>
              </div>
              <p className="acc-hint">The courier calls this number to deliver your order.</p>
            </div>
          </section>

          <section className="acc-section ck-step" aria-labelledby="ck-pay">
            <h2 id="ck-pay" className="ck-step-title">
              <span className="ck-step-num" aria-hidden="true">2</span>
              <FiCreditCard aria-hidden="true" /> Payment
            </h2>
            {/* Replaced by the real method picker below; kept in case payments are switched off again.
            <div className="ck-pay-note">
              <FiInfo aria-hidden="true" />
              <p>Online payment will be added soon — your order is placed with payment pending.</p>
            </div>
            */}
            {methods === null ? (
              <p className="acc-muted" role="status">Loading payment options…</p>
            ) : (
              <fieldset className="ck-fieldset" disabled={submitting}>
                <legend className="ck-sr">Choose a payment method</legend>
                <ul className="ck-pay-options">
                  {methods.map((m) => {
                    const Icon = METHOD_ICON[m.id] || FiCreditCard;
                    const on = !!m.enabled;
                    const picked = payMethod === m.id;
                    return (
                      <li key={m.id}>
                        <label className={`ck-option ck-pay-option${picked ? " is-selected" : ""}${on ? "" : " is-disabled"}`}>
                          <input
                            type="radio"
                            name="ck-payment"
                            value={m.id}
                            checked={picked}
                            disabled={!on}
                            onChange={() => setPayMethod(m.id)}
                          />
                          <span className="ck-pay-icon" aria-hidden="true"><Icon /></span>
                          <span className="ck-pay-text">
                            <span className="ck-option-text">
                              {m.label}
                              {!on && <span className="ck-tag">Coming soon</span>}
                            </span>
                            {METHOD_HELP[m.id] && <span className="ck-pay-help">{METHOD_HELP[m.id]}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            {methodsFailed && (
              <div className="ck-pay-note">
                <FiInfo aria-hidden="true" />
                <p>Other payment options could not be loaded. You can still pay with cash on delivery.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="ck-summary acc-section" aria-labelledby="ck-sum">
          <h2 id="ck-sum" className="ck-step-title">
            Order summary <span className="ck-count">{count} {count === 1 ? "item" : "items"}</span>
          </h2>

          <ul className="ck-items">
            {items.map((i) => {
              const p = i.product || {};
              const img = p.images?.[0]?.url;
              return (
                <li key={i._id || p._id} className="ck-item">
                  <div className="ck-thumb">{img && <img src={img} alt="" loading="lazy" />}</div>
                  <div className="ck-item-main">
                    <p className="ck-item-name">{p.name || "Product"}</p>
                    {formatSelected(i.selected) && <p className="ck-item-sub">{formatSelected(i.selected)}</p>}
                    <p className="ck-item-sub">
                      {i.quantity} × {formatMoney(unitPrice(p, i.selected))}
                    </p>
                  </div>
                  <p className="ck-item-total">{formatMoney(unitPrice(p, i.selected) * (Number(i.quantity) || 0))}</p>
                </li>
              );
            })}
          </ul>

          <dl className="ck-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="ck-save">
                <dt>Discount</dt>
                <dd>−{formatMoney(discount)}</dd>
              </div>
            )}
            <div>
              <dt>Delivery</dt>
              <dd>{shippingFee > 0 ? formatMoney(shippingFee) : "Free"}</dd>
            </div>
            <div className="ck-grand">
              <dt>Total</dt>
              <dd>{formatMoney(total)}</dd>
            </div>
          </dl>

          {/* Always rendered so screen readers pick up the message when it appears. */}
          <div className="ck-error" role="alert" aria-live="assertive">
            {error && <p className="acc-msg acc-msg--error">{error}</p>}
          </div>

          <button type="submit" className="acc-btn acc-btn--primary ck-place" disabled={submitting || cart.loading}>
            <FiLock aria-hidden="true" /> {submitting ? "Placing order…" : payMethod === "jazzcash" ? "Place order and pay" : "Place order"}
          </button>
          <p className="acc-hint ck-fine">Prices and stock are checked again when you place the order.</p>
        </aside>
      </form>
    </div>
  );
};

export default CheckoutPage;
