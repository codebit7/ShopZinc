import { useEffect, useState } from "preact/hooks";
import { useDispatch, useSelector } from "react-redux";
import { FiCheck, FiEdit2, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { updateMe } from "../../Store/slices/authSlice";
import "./account.css";

// Address book, moved out of the old single ProfilePage. Same save logic as before.
const EMPTY_ADDRESS = { street: "", city: "", state: "", postalCode: "", country: "", isDefault: false };
const MAX_ADDRESSES = 5;

// Only the fields the API accepts; the stored _id would otherwise ride along in every save.
const toPayload = (a) => ({
  street: a.street || "",
  city: a.city || "",
  state: a.state || "",
  postalCode: a.postalCode || "",
  country: a.country || "",
  isDefault: !!a.isDefault,
});

const AddressesPage = () => {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);

  // formIndex is null (closed), -1 (new), or the index being edited.
  const [formIndex, setFormIndex] = useState(null);
  const [addrDraft, setAddrDraft] = useState(EMPTY_ADDRESS);
  const [addrStatus, setAddrStatus] = useState({ saving: false, error: "", ok: false });

  // PageTitle has no entry for this path and would say "Page not found".
  useEffect(() => {
    document.title = "Addresses | Shopzinc";
  }, []);

  useEffect(() => {
    if (!addrStatus.ok) return;
    const t = setTimeout(() => setAddrStatus((s) => ({ ...s, ok: false })), 2500);
    return () => clearTimeout(t);
  }, [addrStatus.ok]);

  if (!user) {
    return <div className="acc-loading" role="status">Loading your addresses…</div>;
  }

  const addresses = Array.isArray(user.addresses) ? user.addresses : [];

  // Every address change sends the whole list; the server validates and picks a default.
  const saveAddresses = async (next) => {
    setAddrStatus({ saving: true, error: "", ok: false });
    const res = await dispatch(updateMe({ addresses: next.map(toPayload) }));
    if (updateMe.fulfilled.match(res)) {
      setAddrStatus({ saving: false, error: "", ok: true });
      return true;
    }
    setAddrStatus({ saving: false, error: res.payload || "Could not save", ok: false });
    return false;
  };

  const openForm = (index) => {
    setFormIndex(index);
    setAddrDraft(index === -1 ? { ...EMPTY_ADDRESS, isDefault: addresses.length === 0 } : toPayload(addresses[index]));
    setAddrStatus({ saving: false, error: "", ok: false });
  };

  const submitAddress = async (e) => {
    e.preventDefault();
    let next = addresses.map(toPayload);
    if (formIndex === -1) next.push({ ...addrDraft });
    else next[formIndex] = { ...addrDraft };
    // The server rejects two defaults, so ticking "default" here un-defaults the others.
    if (addrDraft.isDefault) {
      const target = formIndex === -1 ? next.length - 1 : formIndex;
      next = next.map((a, i) => ({ ...a, isDefault: i === target }));
    }
    if (await saveAddresses(next)) setFormIndex(null);
  };

  const removeAddress = (index) => {
    if (!window.confirm("Remove this address?")) return;
    saveAddresses(addresses.map(toPayload).filter((_, i) => i !== index));
    if (formIndex !== null) setFormIndex(null);
  };

  const makeDefault = (index) => {
    saveAddresses(addresses.map((a, i) => ({ ...toPayload(a), isDefault: i === index })));
  };

  const field = (key, label, opts = {}) => (
    <label className={`acc-field${opts.wide ? " acc-field--wide" : ""}`}>
      <span>
        {label}
        {opts.required && <em aria-hidden="true"> *</em>}
      </span>
      <input
        type="text"
        className="acc-input"
        value={addrDraft[key]}
        required={opts.required}
        maxLength={120}
        autoComplete={opts.autoComplete}
        onInput={(e) => setAddrDraft((d) => ({ ...d, [key]: e.currentTarget.value }))}
      />
    </label>
  );

  return (
    <div className="acc-page">
      <header className="acc-head acc-head--row">
        <div>
          <h1 className="acc-title">Addresses</h1>
          <p className="acc-meta"><span>{addresses.length} of {MAX_ADDRESSES} saved</span></p>
        </div>
        {formIndex === null && addresses.length < MAX_ADDRESSES && (
          <button type="button" className="acc-btn acc-btn--primary" onClick={() => openForm(-1)}>
            <FiPlus aria-hidden="true" /> Add address
          </button>
        )}
      </header>

      {addrStatus.error && <p className="acc-msg acc-msg--error" role="alert">{addrStatus.error}</p>}
      {addrStatus.ok && <p className="acc-msg acc-msg--ok" role="status"><FiCheck aria-hidden="true" /> Saved</p>}

      {formIndex !== null && (
        <form className="acc-section acc-form" onSubmit={submitAddress}>
          <h2 className="acc-form-title">{formIndex === -1 ? "New address" : "Edit address"}</h2>
          <div className="acc-form-grid">
            {field("street", "Street", { required: true, wide: true, autoComplete: "street-address" })}
            {field("city", "City", { required: true, autoComplete: "address-level2" })}
            {field("state", "State / Province", { autoComplete: "address-level1" })}
            {field("postalCode", "Postal code", { autoComplete: "postal-code" })}
            {field("country", "Country", { required: true, autoComplete: "country-name" })}
          </div>
          <label className="acc-check">
            <input
              type="checkbox"
              checked={addrDraft.isDefault}
              onChange={(e) => setAddrDraft((d) => ({ ...d, isDefault: e.currentTarget.checked }))}
            />
            Use as my default address
          </label>
          <div className="acc-actions">
            <button type="submit" className="acc-btn acc-btn--primary" disabled={addrStatus.saving}>
              <FiCheck aria-hidden="true" /> {addrStatus.saving ? "Saving…" : "Save address"}
            </button>
            <button type="button" className="acc-btn" disabled={addrStatus.saving} onClick={() => setFormIndex(null)}>
              <FiX aria-hidden="true" /> Cancel
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && formIndex === null ? (
        <div className="acc-empty">
          <p className="acc-empty-title">No saved addresses</p>
          <p className="acc-muted">Add one now so checkout is faster later.</p>
        </div>
      ) : (
        <ul className="acc-addr-grid">
          {addresses.map((a, i) => (
            <li key={a._id || i} className={`acc-addr${a.isDefault ? " is-default" : ""}`}>
              {a.isDefault && <p className="acc-addr-tag">Default</p>}
              <address className="acc-address">
                <strong>{a.street}</strong>
                <br />
                {[a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
                <br />
                {a.country}
              </address>
              <div className="acc-addr-actions">
                <button type="button" className="acc-text-btn" disabled={addrStatus.saving} onClick={() => openForm(i)}>
                  <FiEdit2 aria-hidden="true" /> Edit
                </button>
                {!a.isDefault && (
                  <button type="button" className="acc-text-btn" disabled={addrStatus.saving} onClick={() => makeDefault(i)}>
                    Set as default
                  </button>
                )}
                <button type="button" className="acc-text-btn acc-text-btn--danger" disabled={addrStatus.saving} onClick={() => removeAddress(i)}>
                  <FiTrash2 aria-hidden="true" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AddressesPage;
