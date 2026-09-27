import React, { useEffect, useState } from "react";
import { FaArrowUp, FaArrowDown, FaEdit, FaTimes, FaImage } from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
// Drawer (cus-drawer) and thumb (inv-thumb) styles are shared from the Customers/Inventory pages.
import "./../Styles/inventory.css";
import "./../Styles/homeSections.css";

const SORTS = [
  ["newest", "Newest first"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["discount_desc", "Biggest discount"],
];
// Same list as backend middlewares/multer.js; anything else is rejected there with a 400.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Store currency is PKR now; one shared formatter instead of a local "$"/USD one.
// const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const money = formatPrice;

// Inputs hold strings so a field can be empty; empty means "no filter".
const toDraft = (f = {}) => ({
  minPrice: f.minPrice ?? "",
  maxPrice: f.maxPrice ?? "",
  minDiscount: f.minDiscount ?? "",
  sort: f.sort || "newest",
  limit: f.limit ?? 8,
});
const num = (v) => (v === "" || v == null ? null : Number(v));
const clampLimit = (v) => Math.min(12, Math.max(1, Number(v) || 8));

// Order by homeOrder, then name, so rows that are all 0 still show in a stable order.
const byOrder = (a, b) => (a.homeOrder || 0) - (b.homeOrder || 0) || String(a.name).localeCompare(String(b.name));

// Admin picks which categories appear on the storefront home page, their order, and the product filters.
const HomeSections = () => {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(toDraft());
  const [preview, setPreview] = useState({ loading: false, items: [], total: 0, error: "" });

  useEffect(() => {
    api.get("/category")
      .then((res) => setCats(Array.isArray(res.data) ? res.data : res.data.category || []))
      .catch((err) => setError(err.response?.data?.message || "Could not load categories"))
      .finally(() => setLoading(false));
  }, []);

  const list = [...cats].sort(byOrder);
  const open = cats.find((c) => c._id === openId);

  // Update response is {message, category}; fall back to the body itself in case it is returned bare.
  const merge = (updated) => setCats((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));

  // One wrapper so every action disables the buttons and shows the server's own error message.
  const run = async (request) => {
    setError("");
    setBusy(true);
    try {
      await request();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const put = async (id, body) => {
    const res = await api.put(`/category/${id}`, body);
    merge(res.data.category || res.data);
  };

  const toggleShow = (cat) => run(() => put(cat._id, { showOnHome: !cat.showOnHome }));

  // Swap two rows, then save every row whose position number changed. When all homeOrder values
  // are still 0 this writes 0..n once, so later moves only touch the two swapped rows.
  const move = (index, dir) => {
    const next = [...list];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    const changed = next.map((c, i) => [c, i]).filter(([c, i]) => (c.homeOrder || 0) !== i);
    run(() => Promise.all(changed.map(([c, i]) => put(c._id, { homeOrder: i }))));
  };

  const openEdit = (cat) => {
    setOpenId(cat._id);
    setDraft(toDraft(cat.homeFilters));
  };

  // Escape closes the drawer, same as the close button (matches Customers).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  // Live preview of the unsaved filters; debounced so typing a price doesn't fire a request per key.
  useEffect(() => {
    if (!openId) return;
    const t = setTimeout(() => {
      const params = { category: openId, sort: draft.sort, limit: clampLimit(draft.limit), page: 1 };
      for (const k of ["minPrice", "maxPrice", "minDiscount"]) if (draft[k] !== "") params[k] = draft[k];
      setPreview((p) => ({ ...p, loading: true, error: "" }));
      api.get("/products", { params })
        .then((res) => setPreview({ loading: false, items: res.data.data || [], total: res.data.totalProducts || 0, error: "" }))
        .catch((err) => setPreview({ loading: false, items: [], total: 0, error: err.response?.data?.message || "Preview failed" }));
    }, 400);
    return () => clearTimeout(t);
  }, [openId, draft]);

  const saveFilters = (e) => {
    e.preventDefault();
    // null clears a filter on the server; an omitted key would keep the old value.
    run(() =>
      put(openId, {
        homeFilters: {
          minPrice: num(draft.minPrice),
          maxPrice: num(draft.maxPrice),
          minDiscount: num(draft.minDiscount),
          sort: draft.sort,
          limit: clampLimit(draft.limit),
        },
      })
    );
  };

  const uploadCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again after a failed upload
    if (!file) return;
    // Same rules as the server's multer (4 types, 5 MB), so a HEIC/AVIF/SVG or big photo gets a clear message, not a 400.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return setError("Please choose a JPG, PNG, WebP or GIF image.");
    if (file.size > 5 * 1024 * 1024) return setError("Image must be 5 MB or smaller.");
    const fd = new FormData();
    fd.append("image", file);
    run(async () => {
      const res = await api.put(`/category/${openId}/cover`, fd);
      merge(res.data.category || res.data);
    });
  };

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <div className="hs">
      <div className="adm-page-head">
        <div>
          <h2>Home sections</h2>
          <p>Choose which categories show on the home page, their order, and which products they show.</p>
        </div>
      </div>

      {error && (
        <div className="adm-error hs-error" role="alert">
          <span>{error}</span>
          <button type="button" className="adm-btn ghost sm icon" aria-label="Dismiss" onClick={() => setError("")}>
            <FaTimes />
          </button>
        </div>
      )}

      <div className="adm-card">
        <div className="adm-card-header">
          <h4>Categories</h4>
          <span className="adm-muted">{list.filter((c) => c.showOnHome).length} of {list.length} on home</span>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Show on home</th>
                <th>Order</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="adm-empty">Loading...</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={4}><div className="adm-empty">No categories yet. Add one on the Categories page.</div></td></tr>
              ) : (
                list.map((cat, i) => (
                  <tr key={cat._id}>
                    <td>
                      <div className="inv-product">
                        {cat.coverImage?.url ? (
                          <img className="inv-thumb" src={cat.coverImage.url} alt="" />
                        ) : (
                          <span className="inv-thumb inv-thumb-empty" aria-hidden="true"><FaImage /></span>
                        )}
                        <div className="inv-product-text">
                          <div className="inv-name">{cat.name}</div>
                          <div className="adm-muted">{cat.description || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <label className="hs-toggle">
                        <input type="checkbox" checked={!!cat.showOnHome} disabled={busy} onChange={() => toggleShow(cat)} />
                        <span>{cat.showOnHome ? "Shown" : "Hidden"}</span>
                      </label>
                    </td>
                    <td className="hs-order">
                      <button type="button" className="adm-btn ghost sm icon" aria-label={`Move ${cat.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                        <FaArrowUp />
                      </button>
                      <button type="button" className="adm-btn ghost sm icon" aria-label={`Move ${cat.name} down`} disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>
                        <FaArrowDown />
                      </button>
                    </td>
                    <td className="actions">
                      <button type="button" className="adm-btn secondary sm" onClick={() => openEdit(cat)}>
                        <FaEdit aria-hidden="true" /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <>
          <div className="cus-backdrop" onClick={() => setOpenId(null)} />
          <aside className="cus-drawer hs-drawer" role="dialog" aria-modal="true" aria-label={`${open.name} home section`}>
            <div className="cus-drawer-head">
              <div className="inv-product-text">
                <div className="inv-name">{open.name}</div>
                <div className="adm-muted">Home section settings</div>
              </div>
              <button type="button" className="adm-btn ghost sm icon" aria-label="Close" onClick={() => setOpenId(null)}>
                <FaTimes />
              </button>
            </div>

            <div className="cus-drawer-body">
              <div className="adm-field">
                <span className="adm-label">Cover image</span>
                <div className="hs-cover">
                  {open.coverImage?.url ? (
                    <img src={open.coverImage.url} alt={`${open.name} cover`} />
                  ) : (
                    <div className="hs-cover-empty adm-muted"><FaImage aria-hidden="true" /> No cover yet</div>
                  )}
                </div>
                <label className={`adm-btn secondary sm hs-upload${busy ? " disabled" : ""}`}>
                  {busy ? "Saving..." : open.coverImage?.url ? "Change cover" : "Upload cover"}
                  {/* <input type="file" accept="image/*" className="adm-visually-hidden" disabled={busy} onChange={uploadCover} /> */}
                  {/* Only the types the server's multer accepts, so the picker does not offer files that would 400. */}
                  <input type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="adm-visually-hidden" disabled={busy} onChange={uploadCover} />
                </label>
              </div>

              <form onSubmit={saveFilters}>
                <div className="hs-fields">
                  <div className="adm-field">
                    <label className="adm-label" htmlFor="hs-min">Min price</label>
                    <input id="hs-min" className="adm-input" type="number" min="0" step="0.01" value={draft.minPrice} onInput={set("minPrice")} />
                  </div>
                  <div className="adm-field">
                    <label className="adm-label" htmlFor="hs-max">Max price</label>
                    <input id="hs-max" className="adm-input" type="number" min="0" step="0.01" value={draft.maxPrice} onInput={set("maxPrice")} />
                  </div>
                  <div className="adm-field">
                    <label className="adm-label" htmlFor="hs-disc">Min discount (%)</label>
                    <input id="hs-disc" className="adm-input" type="number" min="0" max="100" value={draft.minDiscount} onInput={set("minDiscount")} />
                  </div>
                  <div className="adm-field">
                    <label className="adm-label" htmlFor="hs-limit">Number of products</label>
                    <input id="hs-limit" className="adm-input" type="number" min="1" max="12" value={draft.limit} onInput={set("limit")} />
                  </div>
                </div>
                <div className="adm-field">
                  <label className="adm-label" htmlFor="hs-sort">Sort</label>
                  <select id="hs-sort" className="adm-select" value={draft.sort} onChange={set("sort")}>
                    {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <button type="submit" className="adm-btn primary" disabled={busy}>
                  {busy ? "Saving..." : "Save filters"}
                </button>
              </form>

              <div className="hs-preview-head">
                <h5>Preview</h5>
                <span className="adm-muted">
                  {preview.loading ? "Loading..." : `${preview.total} product${preview.total === 1 ? "" : "s"} match`}
                </span>
              </div>
              {preview.error ? (
                <div className="adm-error">{preview.error}</div>
              ) : !preview.loading && preview.items.length === 0 ? (
                <div className="adm-empty">No products match these filters.</div>
              ) : (
                <div className="hs-grid">
                  {preview.items.map((p) => (
                    <div className="hs-item" key={p._id}>
                      {p.images?.[0]?.url ? (
                        <img src={p.images[0].url} alt="" />
                      ) : (
                        <div className="hs-item-noimg adm-muted"><FaImage aria-hidden="true" /></div>
                      )}
                      <div className="hs-item-name">{p.name}</div>
                      <div className="adm-muted">{money(p.price)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default HomeSections;
