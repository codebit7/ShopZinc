import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FiPlus, FiEdit2, FiTrash2, FiArrowUp, FiArrowDown, FiEye, FiEyeOff, FiX, FiImage, FiExternalLink,
  FiCheckCircle, FiClock, FiSlash,
} from "react-icons/fi";
import api from "../../api/client";
import { CustomSlide } from "../../components/HeroCarousel/HeroCarousel";
import "../../components/HeroCarousel/heroCarousel.css";
import "./../Styles/carousel.css";

// Admin → Carousel: the slides at the top of the store home page.
// Server rules (lengths, safe links, schedule) live in backend controllers/carouselController.js.

const LINK_TYPES = [
  ["none", "No button"],
  ["product", "A product"],
  ["category", "A category"],
  ["url", "Other page / web address"],
];

// Same list as backend middlewares/multer.js; anything else is rejected there with a 400.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
// Date <-> the value of <input type="datetime-local"> (local time, no seconds).
const pad = (n) => String(n).padStart(2, "0");
const toInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// What the store shows for this slide right now. Icon + word, never colour alone.
const statusOf = (s, now = new Date()) => {
  if (!s.active) return { cls: "", icon: FiEyeOff, text: "Hidden" };
  if (s.startsAt && new Date(s.startsAt) > now) return { cls: "warning", icon: FiClock, text: `Starts ${shortDate(s.startsAt)}` };
  if (s.endsAt && new Date(s.endsAt) <= now) return { cls: "critical", icon: FiSlash, text: `Ended ${shortDate(s.endsAt)}` };
  return { cls: "good", icon: FiCheckCircle, text: s.endsAt ? `Live until ${shortDate(s.endsAt)}` : "Live" };
};

const EMPTY = {
  title: "", subtitle: "", eyebrow: "", buttonText: "Shop now",
  linkType: "none", linkValue: "", active: true, startsAt: "", endsAt: "",
};

// ---------- add / edit dialog ----------
const SlideEditor = ({ slide, products, categories, onClose, onSaved }) => {
  const editing = Boolean(slide);
  const [form, setForm] = useState(() => (slide ? {
    title: slide.title || "", subtitle: slide.subtitle || "", eyebrow: slide.eyebrow || "",
    buttonText: slide.buttonText || "Shop now",
    linkType: slide.link?.type || "none", linkValue: slide.link?.value || "",
    active: slide.active !== false, startsAt: toInput(slide.startsAt), endsAt: toInput(slide.endsAt),
  } : EMPTY));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(slide?.image?.url || "");
  const [status, setStatus] = useState({ saving: false, error: "" });
  const dialogRef = useRef(null);

  // Esc closes; focus starts inside the dialog.
  useEffect(() => {
    dialogRef.current?.querySelector("input, select, textarea, button")?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Free the preview URL of a picked file.
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // if (!f.type.startsWith("image/")) { setStatus({ saving: false, error: "Please choose an image file." }); return; }
    // if (f.size > 8 * 1024 * 1024) { setStatus({ saving: false, error: "Image must be 8 MB or smaller." }); return; }
    // Match the server's multer rules (4 types, 5 MB): HEIC/AVIF/SVG or 5-8 MB files passed here and then got a 400.
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) { setStatus({ saving: false, error: "Please choose a JPG, PNG, WebP or GIF image." }); return; }
    if (f.size > 5 * 1024 * 1024) { setStatus({ saving: false, error: "Image must be 5 MB or smaller." }); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus({ saving: false, error: "" });
  };

  // The href the store will use, for the live preview only.
  const previewHref = form.linkType === "product" && form.linkValue ? `/product/${form.linkValue}`
    : form.linkType === "category" && form.linkValue ? `/filter?category=${form.linkValue}`
    : form.linkType === "url" && form.linkValue ? form.linkValue : null;

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setStatus({ saving: false, error: "Please add a title." });
    if (!editing && !file) return setStatus({ saving: false, error: "Please add an image." });
    if ((form.linkType === "product" || form.linkType === "category") && !form.linkValue) {
      return setStatus({ saving: false, error: `Please choose a ${form.linkType}.` });
    }
    const fd = new FormData();
    for (const k of ["title", "subtitle", "eyebrow", "buttonText", "linkType", "linkValue"]) fd.append(k, form[k]);
    fd.append("active", String(form.active));
    // "" clears a date on the server; a value is sent as a real instant (ISO) from local time.
    fd.append("startsAt", form.startsAt ? new Date(form.startsAt).toISOString() : "");
    fd.append("endsAt", form.endsAt ? new Date(form.endsAt).toISOString() : "");
    if (file) fd.append("image", file);
    setStatus({ saving: true, error: "" });
    try {
      if (editing) await api.put(`/carousel/${slide._id}`, fd);
      else await api.post("/carousel", fd);
      onSaved();
    } catch (err) {
      setStatus({ saving: false, error: err.response?.data?.message || "Could not save the slide." });
    }
  };

  return (
    <div className="cm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-dialog-title" ref={dialogRef} onSubmit={save}>
        <div className="cm-dialog-head">
          <h3 id="cm-dialog-title">{editing ? "Edit slide" : "Add slide"}</h3>
          <button type="button" className="adm-btn ghost icon" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>

        <div className="cm-dialog-body">
          {/* Live preview: the same component the store uses. */}
          <div className="cm-preview-wrap">
            <span className="adm-label">Preview</span>
            <div className="cm-preview hc" aria-hidden="true">
              <div className="hc-slide hc-slide--custom cm-preview-slide">
                <CustomSlide
                  slide={{ ...form, image: preview ? { url: preview } : null, href: previewHref, title: form.title || "Your title here" }}
                  first
                  hidden
                />
              </div>
            </div>
          </div>

          <div className="cm-fields">
            <div className="adm-field">
              <span className="adm-label">Image {editing ? "" : <em className="cm-req">required</em>}</span>
              <label className="cm-file">
                <FiImage aria-hidden="true" />
                <span>{file ? file.name : editing ? "Change image" : "Choose image"}</span>
                {/* <input type="file" accept="image/*" className="cm-visually-hidden" onChange={pickFile} /> */}
                {/* Only the types the server's multer accepts, so the picker does not offer files that would 400. */}
                <input type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="cm-visually-hidden" onChange={pickFile} />
              </label>
              <span className="cm-hint">Wide photo works best (about 1600 × 600). Text sits on the left.</span>
            </div>

            <div className="adm-field">
              <label className="adm-label" htmlFor="cm-eyebrow">Small heading <span className="cm-opt">optional</span></label>
              <input id="cm-eyebrow" className="adm-input" maxLength={40} placeholder="e.g. Summer sale" value={form.eyebrow} onInput={set("eyebrow")} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="cm-title">Title <em className="cm-req">required</em></label>
              <input id="cm-title" className="adm-input" maxLength={80} placeholder="e.g. Up to 40% off phones" value={form.title} onInput={set("title")} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="cm-subtitle">Text <span className="cm-opt">optional</span></label>
              <textarea id="cm-subtitle" className="adm-textarea" rows={2} maxLength={200} placeholder="One short line about the offer" value={form.subtitle} onInput={set("subtitle")} />
            </div>

            <div className="cm-row">
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-linktype">Button goes to</label>
                <select id="cm-linktype" className="adm-select" value={form.linkType} onChange={(e) => setForm((f) => ({ ...f, linkType: e.target.value, linkValue: "" }))}>
                  {LINK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.linkType !== "none" && (
                <div className="adm-field">
                  <label className="adm-label" htmlFor="cm-buttontext">Button text</label>
                  <input id="cm-buttontext" className="adm-input" maxLength={24} value={form.buttonText} onInput={set("buttonText")} />
                </div>
              )}
            </div>
            {form.linkType === "product" && (
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-product">Product</label>
                <select id="cm-product" className="adm-select" value={form.linkValue} onChange={set("linkValue")}>
                  <option value="">Choose a product</option>
                  {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {form.linkType === "category" && (
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-category">Category</label>
                <select id="cm-category" className="adm-select" value={form.linkValue} onChange={set("linkValue")}>
                  <option value="">Choose a category</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {form.linkType === "url" && (
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-url">Page or web address</label>
                <input id="cm-url" className="adm-input" placeholder="/filter?sort=discount_desc  or  https://…" value={form.linkValue} onInput={set("linkValue")} />
                <span className="cm-hint">Start with / for a page in this store, or https:// for another site.</span>
              </div>
            )}

            <div className="cm-row">
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-start">Show from <span className="cm-opt">optional</span></label>
                <input id="cm-start" type="datetime-local" className="adm-input" value={form.startsAt} onChange={set("startsAt")} />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cm-end">Show until <span className="cm-opt">optional</span></label>
                <input id="cm-end" type="datetime-local" className="adm-input" value={form.endsAt} min={form.startsAt || undefined} onChange={set("endsAt")} />
              </div>
            </div>

            <label className="cm-check">
              <input type="checkbox" checked={form.active} onChange={set("active")} />
              <span>Show this slide on the store</span>
            </label>
          </div>
        </div>

        {status.error && <div className="adm-error cm-error" role="alert">{status.error}</div>}
        <div className="cm-dialog-foot">
          <button type="button" className="adm-btn secondary" onClick={onClose} disabled={status.saving}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={status.saving}>
            {status.saving ? "Saving..." : editing ? "Save changes" : "Add slide"}
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------- page ----------
const CarouselManager = () => {
  const [data, setData] = useState({ loading: true, error: "", slides: [], settings: { showAuto: true } });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editor, setEditor] = useState(null); // null | "new" | slide
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api.get("/carousel/admin")
      .then((res) => setData({ loading: false, error: "", slides: res.data.slides || [], settings: res.data.settings || { showAuto: true } }))
      .catch((err) => setData((d) => ({ ...d, loading: false, error: err.response?.data?.message || "Could not load slides" })));

  useEffect(() => {
    load();
    // For the "button goes to" pickers.
    // Kept at limit=1000 (API max): the picker needs real product names, not a count. Past 1000 products
    // the picker only lists the first 1000; a search-as-you-type picker would be the real fix.
    api.get("/products", { params: { page: 1, limit: 1000 } })
      .then((res) => setProducts([...(res.data.data || [])].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
    api.get("/category").then((res) => setCategories(Array.isArray(res.data) ? res.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const names = useMemo(() => ({
    product: Object.fromEntries(products.map((p) => [p._id, p.name])),
    category: Object.fromEntries(categories.map((c) => [c._id, c.name])),
  }), [products, categories]);

  const linkText = (s) => {
    const l = s.link || {};
    if (l.type === "product") return `Product: ${names.product[l.value] || "(deleted product)"}`;
    if (l.type === "category") return `Category: ${names.category[l.value] || "(deleted category)"}`;
    if (l.type === "url") return l.value;
    return "No button";
  };

  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      await fn();
      await load();
      if (done) setNotice(done);
    } catch (err) {
      alert(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const move = (i, dir) => {
    const ids = data.slides.map((s) => s._id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Move at once on screen; the server confirms (load() fixes it if the save fails).
    setData((d) => ({ ...d, slides: ids.map((id) => d.slides.find((s) => s._id === id)) }));
    run(`move-${ids[j]}`, () => api.put("/carousel/order", { ids }), "Order saved");
  };

  const toggleActive = (s) => {
    const fd = new FormData();
    fd.append("active", String(!s.active));
    run(`active-${s._id}`, () => api.put(`/carousel/${s._id}`, fd), s.active ? "Slide hidden" : "Slide shown");
  };

  const remove = (s) => {
    if (!window.confirm(`Delete the slide "${s.title}"? This can't be undone.`)) return;
    run(`del-${s._id}`, () => api.delete(`/carousel/${s._id}`), "Slide deleted");
  };

  const toggleAuto = () => {
    const next = !data.settings.showAuto;
    setData((d) => ({ ...d, settings: { ...d.settings, showAuto: next } }));
    run("auto", () => api.put("/carousel/settings", { showAuto: next }), next ? "Automatic slides on" : "Automatic slides off");
  };

  const liveCount = data.slides.filter((s) => statusOf(s).cls === "good").length;

  return (
    <div className="cm">
      <div className="adm-page-head">
        <div>
          <h2>Carousel</h2>
          <p>The slides at the top of your store's home page. {liveCount} of {data.slides.length} {data.slides.length === 1 ? "slide is" : "slides are"} live.</p>
        </div>
        <div className="cm-head-actions">
          <a href="/" target="_blank" rel="noopener" className="adm-btn secondary"><FiExternalLink aria-hidden="true" /> View store</a>
          <button type="button" className="adm-btn primary" onClick={() => setEditor("new")}><FiPlus aria-hidden="true" /> Add slide</button>
        </div>
      </div>

      {notice && <div className="cm-notice" role="status"><FiCheckCircle aria-hidden="true" /> {notice}</div>}

      <section className="adm-card cm-setting">
        <div>
          <strong id="cm-auto-label">Also show automatic slides</strong>
          <p>Home-page categories and the best current deal, after your own slides. If you have no live slides, they always show so the home page is never empty.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.settings.showAuto}
          aria-labelledby="cm-auto-label"
          className={`cm-switch${data.settings.showAuto ? " on" : ""}`}
          onClick={toggleAuto}
          disabled={busy === "auto" || data.loading}
        >
          <span className="cm-switch-knob" />
        </button>
      </section>

      {data.error && <div className="adm-error" role="alert">{data.error}</div>}

      <section className="adm-card">
        <div className="adm-card-header"><h4>Your slides</h4><span className="adm-muted">Shown in this order</span></div>
        {data.loading ? (
          <div className="adm-empty">Loading…</div>
        ) : data.slides.length === 0 ? (
          <div className="adm-empty cm-empty">
            <FiImage aria-hidden="true" />
            <p>No slides yet. The store is showing the automatic slides.</p>
            <button type="button" className="adm-btn primary" onClick={() => setEditor("new")}><FiPlus aria-hidden="true" /> Add your first slide</button>
          </div>
        ) : (
          <ol className="cm-list">
            {data.slides.map((s, i) => {
              const st = statusOf(s);
              const StIcon = st.icon;
              return (
                <li key={s._id} className={`cm-item${s.active ? "" : " is-hidden"}`}>
                  <span className="cm-pos" aria-label={`Position ${i + 1}`}>{i + 1}</span>
                  <img className="cm-thumb" src={s.image?.url} alt="" loading="lazy" />
                  <div className="cm-info">
                    {s.eyebrow && <span className="cm-eyebrow">{s.eyebrow}</span>}
                    <strong className="cm-title" title={s.title}>{s.title}</strong>
                    <span className="cm-link" title={linkText(s)}>{linkText(s)}</span>
                    <span className={`adm-badge ${st.cls}`}><StIcon aria-hidden="true" /> {st.text}</span>
                  </div>
                  <div className="cm-actions">
                    <button type="button" className="adm-btn ghost sm icon" aria-label="Move up" title="Move up" disabled={i === 0 || Boolean(busy)} onClick={() => move(i, -1)}><FiArrowUp /></button>
                    <button type="button" className="adm-btn ghost sm icon" aria-label="Move down" title="Move down" disabled={i === data.slides.length - 1 || Boolean(busy)} onClick={() => move(i, 1)}><FiArrowDown /></button>
                    <button type="button" className="adm-btn ghost sm icon" aria-label={s.active ? "Hide slide" : "Show slide"} title={s.active ? "Hide" : "Show"} disabled={Boolean(busy)} onClick={() => toggleActive(s)}>
                      {s.active ? <FiEye /> : <FiEyeOff />}
                    </button>
                    <button type="button" className="adm-btn ghost sm icon" aria-label="Edit slide" title="Edit" onClick={() => setEditor(s)}><FiEdit2 /></button>
                    <button type="button" className="adm-btn danger sm icon" aria-label="Delete slide" title="Delete" disabled={Boolean(busy)} onClick={() => remove(s)}><FiTrash2 /></button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editor && (
        <SlideEditor
          slide={editor === "new" ? null : editor}
          products={products}
          categories={categories}
          onClose={() => setEditor(null)}
          onSaved={() => { const wasNew = editor === "new"; setEditor(null); load(); setNotice(wasNew ? "Slide added" : "Slide saved"); }}
        />
      )}
    </div>
  );
};

export default CarouselManager;
