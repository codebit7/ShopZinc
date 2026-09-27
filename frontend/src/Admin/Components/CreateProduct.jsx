import React, { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
// updateProduct was called but never imported -> ReferenceError on every edit (BUG-41).
import { createProduct, updateProduct, fetchCategories } from "../../Store/slices/productSlice";
import { useParams, useNavigate } from "react-router-dom";
import { FaCloudUploadAlt, FaPlus, FaTrash } from "react-icons/fa";
import api from "../../api/client";
import "./../Styles/createProducts.css";

// The admin types the discount in Rs, but the DB stores a PERCENT (BUG-62). The cart, checkout,
// cards and badges all read a percent, so convert here only; storing Rs would break all of them.
// Same list as backend middlewares/multer.js; anything else is rejected there with a 400.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const round2 = (n) => Math.round(n * 100) / 100;
const percentToRs = (price, pct) => round2((Number(price) || 0) * (Number(pct) || 0) / 100);
const rsToPercent = (price, rs) => (Number(price) > 0 ? round2((Number(rs) || 0) / Number(price) * 100) : 0);

// Choices (Size, Color...) are edited as text rows: { name: "Size", values: "S, M, L", extras: { L: "200" } }.
// extras is keyed by value, so retyping the values list doesn't shift prices onto the wrong value.
// The server stores { name, values: [...], extras: [...] } and checks the same rules (backend utils/options.js).
const MAX_CHOICES = 5;
const splitValues = (text) => text.split(",").map((v) => v.trim()).filter(Boolean);
// const toRows = (options) => (options || []).map((o) => ({ name: o.name, values: (o.values || []).join(", ") }));
const toRows = (options) => (options || []).map((o) => ({
  name: o.name,
  values: (o.values || []).join(", "),
  extras: Object.fromEntries((o.values || []).map((v, i) => [v, Number(o.extras?.[i]) ? String(o.extras[i]) : ""])),
}));
// const toOptions = (rows) => rows
//   .map((r) => ({ name: r.name.trim(), values: r.values.split(",").map((v) => v.trim()).filter(Boolean) }))
const toOptions = (rows) => rows
  .map((r) => {
    const values = splitValues(r.values);
    // Blank extra = 0. A bad one stays NaN so handleSubmit can name it.
    const extras = values.map((v) => (r.extras?.[v] === undefined || r.extras[v] === "" ? 0 : Number(r.extras[v])));
    return { name: r.name.trim(), values, extras };
  })
  // A fully blank row is just ignored; a half-filled one is caught in handleSubmit.
  .filter((o) => o.name || o.values.length);

const CreateProduct = () => {
  const dispatch = useDispatch();
  const { categories, products } = useSelector((state) => state.products);
  const { id } = useParams();
  const navigate = useNavigate();
  // Local flag: the slice's `loading` tracks product/category fetches, not this save.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Server images kept in edit mode ({url,imageId}). Kept apart from new File
  // uploads so update can send existingImages + new images separately.
  const [existingImages, setExistingImages] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    discount: "",
    // What one unit costs the store. Optional; used only for profit reports, never shown to shoppers.
    costPrice: "",
    category: "",
    brand: "",
    // condition: "Any",
    // Was "Any" with no field in the form, so every admin product got "Any" and the store filter could never pick it.
    condition: "",
    stock: "",
    images: [],
  });

  const [imagePreviews, setImagePreviews] = useState([]);
  // Optional. No rows = a product without choices, which works exactly as before.
  const [choices, setChoices] = useState([]);


  useEffect(() => {
    if (id && id !== null) {
      const product = products.find((p) => p._id === id);
      if (product) {
        // category comes populated as {_id,name}; the select needs the id or nothing shows selected.
        // images start empty: they hold only NEW files, old ones live in existingImages.
        // Functional update: keep the cost price the admin-only fetch may already have filled in
        // (the list never has it), instead of wiping it when this effect runs second.
        setFormData((prev) => ({
          ...product,
          costPrice: prev.costPrice ?? "",
          category: product.category?._id ?? product.category ?? "",
          // Stored as a percent; show it back in Rs, the unit the admin types.
          discount: product.discount ? percentToRs(product.price, product.discount) : "",
          // Old products saved as "Any" must be given a real condition before saving again.
          condition: ["New", "Refurbished", "Used"].includes(product.condition) ? product.condition : "",
          images: [],
        }));
        setExistingImages(product.images || []);
        setChoices(toRows(product.options));
      }
    }
  }, [id, products]);

  // The product list never includes the cost price (hidden from shoppers), so edit mode asks the
  // admin-only endpoint for it. Without this, saving an edit would look like the cost was blank.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.get(`/product/${id}/admin`)
      .then((res) => {
        const cost = res.data?.data?.costPrice;
        if (alive) setFormData((prev) => ({ ...prev, costPrice: typeof cost === "number" ? String(cost) : "" }));
      })
      .catch(() => { /* leave it blank; the admin can still type it */ });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

 
  const handleFileChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    // Count kept server images too, so edit mode can't go over the limit.
    if (files.length + existingImages.length > 5) {
      alert("You can upload a maximum of 5 images.");
      return;
    }
    // Same rules as the server's multer (4 types, 5 MB). Without this, a HEIC/AVIF/SVG or big photo
    // only fails on Save with a 400, after the admin has filled in the whole form.
    const bad = files.find((f) => !ALLOWED_IMAGE_TYPES.includes(f.type) || f.size > 5 * 1024 * 1024);
    if (bad) {
      alert(`"${bad.name}" can't be used. Images must be JPG, PNG, WebP or GIF, 5 MB or smaller.`);
      return;
    }

    const previews = files.map((file) => URL.createObjectURL(file));
    setFormData((prev) => ({ ...prev, images: files }));
    setImagePreviews(previews);
  }, [setFormData, setImagePreviews, existingImages.length]);

  const removeImage = (index) => {
    const updatedPreviews = imagePreviews.filter((_, i) => i !== index);
    const updatedImages = formData.images.filter((_, i) => i !== index);
    setImagePreviews(updatedPreviews);
    setFormData((prev) => ({ ...prev, images: updatedImages }));
  };

  const removeExistingImage = (index) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const addChoice = (name = "") => {
    if (choices.length >= MAX_CHOICES) return;
    setChoices((prev) => [...prev, { name, values: "", extras: {} }]);
  };
  const editChoice = (index, key, value) => {
    setChoices((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const editExtra = (index, value, amount) => {
    setChoices((prev) => prev.map((row, i) => (i === index ? { ...row, extras: { ...row.extras, [value]: amount } } : row)));
  };
  const removeChoice = (index) => {
    setChoices((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.images.length + existingImages.length > 5) {
      alert("You can upload a maximum of 5 images.");
      return;
    }
    // A discount bigger than the price would make the final price negative.
    const discountRs = Number(formData.discount) || 0;
    if (discountRs < 0 || discountRs >= Number(formData.price)) {
      setError("Discount must be less than the price.");
      return;
    }
    if (formData.costPrice !== "" && !(Number(formData.costPrice) >= 0)) {
      setError("Cost price must be 0 or more.");
      return;
    }
    // Checked here so the admin sees which row is wrong; the server checks the same rules again.
    const options = toOptions(choices);
    const badChoice = options.find((o) => !o.name || o.values.length === 0);
    if (badChoice) {
      setError(badChoice.name ? `Add at least one value for "${badChoice.name}".` : "Every choice needs a name, e.g. Size.");
      return;
    }
    for (const o of options) {
      const bad = o.values.find((v, i) => !Number.isFinite(o.extras[i]) || o.extras[i] < 0);
      if (bad) {
        setError(`Extra price for "${bad}" must be 0 or more.`);
        return;
      }
    }
    const names = options.map((o) => o.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      setError("Each choice name can only be used once.");
      return;
    }
    // Rs -> percent for the DB. Empty becomes 0, so clearing the field in edit mode really removes it.
    // const payload = { ...formData, discount: rsToPercent(formData.price, discountRs) };
    // options always sent (even []), so deleting every row in edit mode really removes the choices.
    const payload = { ...formData, discount: rsToPercent(formData.price, discountRs), options };

    setSaving(true);
    setError("");
    try {
      // if/else: without it edit mode ran update AND create -> duplicate product (BUG-43).
      // unwrap() throws on rejection, so a failed save doesn't look like success.
      if (id) {
        await dispatch(updateProduct({ id, product: payload, existingImages })).unwrap();
      } else {
        await dispatch(createProduct(payload)).unwrap();
      }
      alert(id ? "Product updated" : "Product created");
      navigate("/admin/view");
    } catch (err) {
      setError(typeof err === "string" ? err : err?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cp">
      <div className="adm-page-head">
        <div>
          <h2>{id ? "Edit Product" : "Create Product"}</h2>
          <p>{id ? "Update the details, pricing and images of this product." : "Add a new product to your catalog."}</p>
        </div>
      </div>

      {/* Two columns on desktop (content left, pricing/inventory right), one column on mobile. */}
      <div className="cp-layout">
        <div className="cp-main">
          <section className="adm-card">
            <div className="adm-card-header"><h4>Product details</h4></div>
            <div className="adm-card-body cp-stack">
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-name">Product Name</label>
                <input id="cp-name" type="text" className="adm-input" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-desc">Description</label>
                <textarea id="cp-desc" className="adm-textarea" rows={6} name="description" value={formData.description} onChange={handleChange} required />
              </div>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header">
              <h4>Images</h4>
              <span className="adm-muted">{existingImages.length + imagePreviews.length} / 5</span>
            </div>
            <div className="adm-card-body cp-stack">
              {/* Real file input kept (visually hidden) inside a label, so click and keyboard both open the picker. */}
              <label className="cp-dropzone">
                <FaCloudUploadAlt className="cp-dropzone-icon" aria-hidden="true" />
                <span><strong>Click to choose images</strong></span>
                <span className="adm-muted">PNG or JPG, up to 5 files</span>
                {/* <input type="file" className="cp-visually-hidden" multiple accept="image/*" onChange={handleFileChange} /> */}
                {/* Only the types the server's multer accepts, so the picker does not offer files that would 400. */}
                <input type="file" className="cp-visually-hidden" multiple accept={ALLOWED_IMAGE_TYPES.join(",")} onChange={handleFileChange} />
              </label>

              {(imagePreviews.length > 0 || existingImages.length > 0) && (
                <div className="cp-previews">
                  {existingImages.map((img, index) => (
                    <div key={img.imageId || img.url} className="cp-preview">
                      <img src={img.url} alt="Current" />
                      <button type="button" className="cp-preview-remove" aria-label="Remove image" onClick={() => removeExistingImage(index)}>✖</button>
                    </div>
                  ))}
                  {imagePreviews.map((src, index) => (
                    <div key={index} className="cp-preview">
                      <img src={src} alt="Preview" />
                      <button type="button" className="cp-preview-remove" aria-label="Remove image" onClick={() => removeImage(index)}>✖</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header">
              <h4>Choices <span className="adm-muted">(optional)</span></h4>
              <span className="adm-muted">{choices.length} / {MAX_CHOICES}</span>
            </div>
            <div className="adm-card-body cp-stack">
              <p className="adm-muted cp-hint">
                Let shoppers pick a size, colour or anything else. Leave empty if this product has no choices.
              </p>

              {choices.map((row, index) => (
                <div className="cp-choice" key={index}>
                  <div className="adm-field">
                    <label className="adm-label" htmlFor={`cp-choice-name-${index}`}>Name</label>
                    <input
                      id={`cp-choice-name-${index}`}
                      type="text"
                      className="adm-input"
                      placeholder="e.g. Size"
                      value={row.name}
                      onInput={(e) => editChoice(index, "name", e.target.value)}
                    />
                  </div>
                  <div className="adm-field">
                    <label className="adm-label" htmlFor={`cp-choice-values-${index}`}>Values (comma separated)</label>
                    <input
                      id={`cp-choice-values-${index}`}
                      type="text"
                      className="adm-input"
                      placeholder="e.g. S, M, L, XL"
                      value={row.values}
                      onInput={(e) => editChoice(index, "values", e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="adm-btn ghost sm icon cp-choice-remove"
                    aria-label={`Remove choice ${row.name || index + 1}`}
                    onClick={() => removeChoice(index)}
                  >
                    <FaTrash />
                  </button>
                  {/* One small box per value: extra Rs on top of the base price. Blank = no extra. */}
                  {splitValues(row.values).length > 0 && (
                    <div className="cp-extras">
                      <span className="adm-label">Extra price (Rs) — leave blank if same price</span>
                      <div className="cp-extras-grid">
                        {splitValues(row.values).map((v) => (
                          <label className="cp-extra" key={v}>
                            <span className="cp-extra-name" title={v}>{v}</span>
                            <span className="cp-extra-plus" aria-hidden="true">+</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="adm-input"
                              placeholder="0"
                              aria-label={`Extra price for ${v}`}
                              value={row.extras?.[v] ?? ""}
                              onInput={(e) => editExtra(index, v, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {choices.length < MAX_CHOICES && (
                <div className="cp-choice-add">
                  <button type="button" className="adm-btn secondary sm" onClick={() => addChoice()}>
                    <FaPlus aria-hidden="true" /> Add choice
                  </button>
                  {/* Shortcuts for the two most common ones; hidden once they exist. */}
                  {!choices.some((c) => c.name.trim().toLowerCase() === "size") && (
                    <button type="button" className="adm-btn ghost sm" onClick={() => addChoice("Size")}>+ Size</button>
                  )}
                  {!choices.some((c) => c.name.trim().toLowerCase() === "color") && (
                    <button type="button" className="adm-btn ghost sm" onClick={() => addChoice("Color")}>+ Color</button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="cp-side">
          <section className="adm-card">
            <div className="adm-card-header"><h4>Pricing</h4></div>
            <div className="adm-card-body cp-stack">
              <div className="adm-field">
                {/* Prices are stored in PKR now, so say so on the form. */}
                <label className="adm-label" htmlFor="cp-price">Price (Rs)</label>
                <input id="cp-price" type="number" className="adm-input" name="price" value={formData.price} onChange={handleChange} placeholder="e.g. 1499" required />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-discount">Discount (Rs off)</label>
                <input id="cp-discount" type="number" min="0" step="any" className="adm-input" name="discount" value={formData.discount} onChange={handleChange} placeholder="e.g. 300" />
                {/* Show the shopper-facing percent so the admin sees what the badge will say. */}
                {Number(formData.discount) > 0 && Number(formData.price) > 0 && (
                  <span className="adm-muted">= {Math.round(rsToPercent(formData.price, formData.discount))}% off · final price Rs {round2(Number(formData.price) - Number(formData.discount))}</span>
                )}
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-cost">Cost price (Rs) <span className="adm-muted">— optional</span></label>
                <input id="cp-cost" type="number" min="0" step="any" className="adm-input" name="costPrice" value={formData.costPrice ?? ""} onChange={handleChange} placeholder="What one unit costs you" />
                {/* Profit per unit at the final price, so the admin sees the margin while typing. */}
                {formData.costPrice !== "" && Number(formData.price) > 0 && (() => {
                  const sell = Number(formData.price) - (Number(formData.discount) || 0);
                  const profit = round2(sell - Number(formData.costPrice));
                  return (
                    <span className="adm-muted">
                      {profit >= 0 ? "Profit" : "Loss"} per unit: Rs {Math.abs(profit)} · only admins see this
                    </span>
                  );
                })()}
              </div>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header"><h4>Inventory & organization</h4></div>
            <div className="adm-card-body cp-stack">
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-stock">Stock</label>
                <input id="cp-stock" type="number" className="adm-input" name="stock" value={formData.stock} onChange={handleChange} required />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-category">Category</label>
                <select id="cp-category" className="adm-select" name="category" value={formData.category} onChange={handleChange} required>
                  <option value="">Select Category</option>
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>{cat.name}</option>
                    ))
                  ) : (
                    <option disabled>No categories found</option>
                  )}
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-brand">Brand</label>
                <input id="cp-brand" type="text" className="adm-input" name="brand" value={formData.brand} onChange={handleChange} required />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="cp-condition">Condition</label>
                <select id="cp-condition" className="adm-select" name="condition" value={formData.condition} onChange={handleChange} required>
                  <option value="" disabled>Choose condition</option>
                  <option value="New">New</option>
                  <option value="Refurbished">Refurbished</option>
                  <option value="Used">Used</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>

      {error && <div className="adm-error" role="alert">{error}</div>}

      {/* Sticky so Save stays reachable on a long form without scrolling back down. */}
      <div className="cp-actions">
        <button type="button" className="adm-btn secondary" onClick={() => navigate("/admin/view")} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="adm-btn primary" disabled={saving}>
          {saving ? "Saving..." : id ? "Update Product" : "Create Product"}
        </button>
      </div>
    </form>
  );
};

export default CreateProduct;
