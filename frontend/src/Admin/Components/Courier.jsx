import React, { useEffect, useState } from "react";
import { FaSyncAlt, FaTruck } from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import { PAYMENT_METHOD, errorText } from "../../Pages/Account/orderUtils";
import "./../Styles/orders.css";
import "./../Styles/courier.css";

// Courier (PostEx) in one place: what is ready to ship, what is on the road, and the settings.
const money = formatPrice;
const date = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const shortId = (id = "") => `#${String(id).slice(-6).toUpperCase()}`;
const pieces = (o) => (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
const isCod = (o) => !o.paymentMethod || o.paymentMethod === "cod";
// What the rider collects: same rule as the server's booking (COD = full total, online = 0).
const collect = (o) => (isCod(o) ? o.totalAmount : 0);

const TABS = [
  { id: "ready", label: "Ready to ship" },
  { id: "shipments", label: "Shipments" },
  { id: "settings", label: "Settings" },
];

const Customer = ({ o }) => (
  <td>
    {o.user?.name || "Unknown customer"}
    <span className="ord-sub">{o.shippingAddress?.phone || "no phone"} · {o.shippingAddress?.city || "no city"}</span>
  </td>
);

// ---------------- Ready to ship ----------------
const ReadyTab = ({ postexOn }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({}); // orderId -> { ok, message, trackingNumber }

  const load = () => {
    setError("");
    return api
      .get("/courier/ready")
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(errorText(e, "Could not load orders")));
  };
  useEffect(() => { load(); }, []);

  const bookable = (rows || []).filter((o) => !o.blocked);
  const allPicked = bookable.length > 0 && bookable.every((o) => picked.includes(o._id));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const book = async () => {
    if (!picked.length) return;
    if (!window.confirm(`Book ${picked.length} order(s) with PostEx? Riders will be sent to pick them up.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/courier/book", { orderIds: picked });
      const map = {};
      (res.data?.results || []).forEach((r) => { map[r.orderId] = r; });
      // Failed rows stay visible with their reason; booked rows leave this list on reload.
      setResults(map);
      setPicked([]);
      await load();
    } catch (e) {
      setError(errorText(e, "Booking failed"));
    } finally {
      setBusy(false);
    }
  };

  const failed = Object.values(results).filter((r) => !r.ok);
  const booked = Object.values(results).filter((r) => r.ok);

  return (
    <div className="adm-card">
      <div className="adm-toolbar">
        <p className="adm-muted crr-grow">
          Processing orders not booked yet. Orders with a problem can't be picked until it is fixed on the Orders page.
        </p>
        <button type="button" className="adm-btn primary" disabled={!postexOn || busy || !picked.length} onClick={book}>
          <FaTruck aria-hidden="true" /> {busy ? "Booking…" : `Book selected (${picked.length})`}
        </button>
      </div>
      {error && <div className="adm-error">{error}</div>}
      {booked.length > 0 && <p className="crr-ok" role="status">Booked {booked.length}: {booked.map((r) => r.trackingNumber).join(", ")}</p>}
      {failed.length > 0 && (
        <div className="adm-error" role="alert">
          {failed.map((r) => <div key={r.orderId}>{shortId(r.orderId)}: {r.message}</div>)}
        </div>
      )}
      {!rows && !error ? (
        <div className="adm-empty">Loading…</div>
      ) : (rows || []).length === 0 ? (
        <div className="adm-empty">Nothing waiting to ship.</div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all bookable orders"
                    checked={allPicked}
                    disabled={!bookable.length}
                    onChange={() => setPicked(allPicked ? [] : bookable.map((o) => o._id))}
                  />
                </th>
                <th>Order</th>
                <th>Placed</th>
                <th>Customer</th>
                <th className="num">Pieces</th>
                <th>Payment</th>
                <th className="num">Rider collects</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o._id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select order ${shortId(o._id)}`}
                      checked={picked.includes(o._id)}
                      disabled={!!o.blocked}
                      onChange={() => toggle(o._id)}
                    />
                  </td>
                  <td className="mono">{shortId(o._id)}</td>
                  <td>{date(o.orderDate || o.createdAt)}</td>
                  <Customer o={o} />
                  <td className="num">{pieces(o)}</td>
                  <td>{PAYMENT_METHOD[o.paymentMethod] || "Cash on Delivery"} · {o.paymentStatus}</td>
                  <td className="num">{money(collect(o))}</td>
                  <td>{o.blocked ? <span className="adm-badge warning">{o.blocked}</span> : <span className="adm-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------------- Shipments ----------------
const ShipmentsTab = ({ postexOn }) => {
  const [status, setStatus] = useState("shipped");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");

  const load = (s = status) => {
    setError("");
    setRows(null);
    return api
      .get("/courier/shipments", { params: s === "all" ? {} : { status: s } })
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(errorText(e, "Could not load shipments")));
  };
  useEffect(() => { load(status); }, [status]);

  const syncAll = async () => {
    setSyncing(true);
    setNote("");
    setError("");
    try {
      const r = (await api.post("/courier/sync")).data || {};
      setNote(`Checked ${r.checked || 0}: ${r.delivered || 0} delivered${r.failed ? `, ${r.failed} could not be checked` : ""}.`);
      await load(status);
    } catch (e) {
      setError(errorText(e, "Could not check with PostEx"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="adm-card">
      <div className="adm-toolbar">
        <div className="adm-segmented" role="group" aria-label="Shipment status">
          {["shipped", "delivered", "cancelled", "all"].map((s) => (
            <button key={s} type="button" className={status === s ? "active" : ""} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === "shipped" ? "On the way" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="adm-btn secondary" disabled={!postexOn || syncing} onClick={syncAll}>
          <FaSyncAlt aria-hidden="true" /> {syncing ? "Checking…" : "Refresh all from PostEx"}
        </button>
      </div>
      {note && <p className="crr-ok" role="status">{note}</p>}
      {error && <div className="adm-error">{error}</div>}
      {!rows && !error ? (
        <div className="adm-empty">Loading…</div>
      ) : (rows || []).length === 0 ? (
        <div className="adm-empty">No shipments here.</div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Tracking #</th>
                <th>Customer</th>
                <th>Courier status</th>
                <th>Booked</th>
                <th>Last checked</th>
                <th className="num">Rider collects</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o._id}>
                  <td className="mono">{shortId(o._id)}</td>
                  <td className="mono">{o.shipment?.trackingNumber}</td>
                  <Customer o={o} />
                  <td>{o.shipment?.status || "—"}</td>
                  <td>{date(o.shipment?.bookedAt)}</td>
                  <td>{date(o.shipment?.lastCheckedAt)}</td>
                  <td className="num">{money(collect(o))}</td>
                  <td>{o.orderStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------------- Settings ----------------
const FIELDS = [
  { key: "shippingFee", label: "Delivery fee (Rs)", help: "Charged on every order below the free-delivery amount." },
  { key: "freeShippingMin", label: "Free delivery from (Rs)", help: "Orders at or above this total get free delivery. 0 = never free." },
  { key: "pickupAddressCode", label: "PostEx pickup address code", help: "From your PostEx merchant portal. Empty = PostEx uses your default address.", text: true },
  { key: "syncMinutes", label: "Auto-check every (minutes)", help: "How often shipped parcels are checked with PostEx. 0 = off, otherwise 5 to 1440." },
];

const SettingsTab = ({ data, onSaved }) => {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(data.effective?.[f.key] ?? "")])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await api.put("/courier/settings", form);
      onSaved(res.data);
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Could not save settings"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="adm-card crr-settings" onSubmit={save}>
      <p className="adm-muted">
        Changes apply at once: the next cart and checkout use the new delivery fee. Orders already placed keep their fee.
        The PostEx API token is not shown here; it stays in the server's .env file for safety.
      </p>
      <div className="adm-grid-2">
        {FIELDS.map((f) => (
          <div className="adm-field" key={f.key}>
            <label className="adm-label" htmlFor={`crr-${f.key}`}>{f.label}</label>
            <input
              id={`crr-${f.key}`}
              className="adm-input"
              type={f.text ? "text" : "number"}
              min={f.text ? undefined : 0}
              step={f.text ? undefined : 1}
              maxLength={f.text ? 50 : undefined}
              value={form[f.key]}
              disabled={busy}
              onInput={(e) => setForm((s) => ({ ...s, [f.key]: e.currentTarget.value }))}
            />
            <small className="adm-muted">{f.help}</small>
          </div>
        ))}
      </div>
      {error && <div className="adm-error" role="alert">{error}</div>}
      {saved && <p className="crr-ok" role="status">Saved.</p>}
      <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </form>
  );
};

const Courier = () => {
  const [tab, setTab] = useState("ready");
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");

  // Loaded once for all tabs: the "PostEx not set up" warning depends on it.
  useEffect(() => {
    api.get("/courier/settings").then((r) => setSettings(r.data)).catch((e) => setError(errorText(e, "Could not load courier settings")));
  }, []);

  const postexOn = !!settings?.postexConfigured;

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <h2>Courier</h2>
          <p>Book parcels with PostEx, follow them, and set delivery charges.</p>
        </div>
      </div>

      {error && <div className="adm-error">{error}</div>}
      {settings && !postexOn && (
        <div className="adm-error" role="status">
          PostEx is not set up yet: add POSTEX_TOKEN to backend/.env and restart the server. Booking and tracking are off until then.
        </div>
      )}

      <div className="adm-segmented crr-tabs" role="tablist" aria-label="Courier sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ready" && <ReadyTab postexOn={postexOn} />}
      {tab === "shipments" && <ShipmentsTab postexOn={postexOn} />}
      {tab === "settings" && (settings ? <SettingsTab data={settings} onSaved={setSettings} /> : <div className="adm-empty">Loading…</div>)}
    </div>
  );
};

export default Courier;
