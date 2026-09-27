// Admin read-only product page. The eye button in ViewProducts had no handler; this is where it goes.
// Data comes from GET /product/:id (not the redux list), so a refresh or a pasted link still works.
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft, FaEdit, FaTrash, FaStar, FaRegStar, FaCopy, FaCheck, FaImage,
} from "react-icons/fa";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";
import { StockBadge } from "./ViewProducts";
import "./../Styles/productView.css";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "—";

const Stars = ({ value }) => (
  <span className="pv-stars" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(value) ? <FaStar key={i} /> : <FaRegStar key={i} />))}
  </span>
);

const ProductView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setActive(0);
    api.get(`/product/${id}`)
      .then((res) => { if (alive) setProduct(res.data.data); })
      .catch((err) => { if (alive) setError(err.response?.data?.message || "Could not load this product."); })
      .finally(() => { if (alive) setLoading(false); });
    // Stops a slow reply for an old id from overwriting the product now on screen.
    return () => { alive = false; };
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await api.delete(`/delete/${id}`);
      navigate("/admin/view");
    } catch (err) {
      alert(err.response?.data?.message || "Error deleting product");
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(product._id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (http, old browser); the ID is still visible to select by hand.
    }
  };

  if (loading) return <div className="pv"><div className="adm-card"><div className="adm-empty">Loading...</div></div></div>;
  if (error || !product) {
    return (
      <div className="pv">
        <Link to="/admin/view" className="pv-back"><FaArrowLeft aria-hidden="true" /> Products</Link>
        <div className="adm-error">{error || "Product not found."}</div>
      </div>
    );
  }

  const {
    name, description, price = 0, discount = 0, stock = 0, brand, condition, category,
    images = [], ratings = [], options = [], isFeatured, createdAt, updatedAt,
  } = product;
  // Discount is a percent (BUG-62) — same maths as the storefront ProductDetails.
  const finalPrice = discount > 0 ? price * (1 - discount / 100) : price;
  const avg = ratings.length ? ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length : 0;
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratings.filter((r) => Math.round(r.rating) === star).length,
  }));
  const mainImg = images[active]?.url;

  return (
    <div className="pv">
      <Link to="/admin/view" className="pv-back"><FaArrowLeft aria-hidden="true" /> Products</Link>

      <div className="adm-page-head">
        <div>
          <h2 className="pv-title">{name}</h2>
          <div className="pv-sub">
            <StockBadge stock={stock} />
            {isFeatured && <span className="adm-badge info">Featured</span>}
            <span className="adm-muted">Updated {fmtDate(updatedAt)}</span>
          </div>
        </div>
        <div>
          <button type="button" className="adm-btn danger" onClick={handleDelete}>
            <FaTrash aria-hidden="true" /> Delete
          </button>
          <button type="button" className="adm-btn primary" onClick={() => navigate(`/admin/create/${product._id}`)}>
            <FaEdit aria-hidden="true" /> Edit product
          </button>
        </div>
      </div>

      <div className="pv-grid">
        <div className="pv-main">
          <section className="adm-card">
            <div className="adm-card-header"><h4>Media</h4><span className="adm-muted">{images.length} image{images.length === 1 ? "" : "s"}</span></div>
            <div className="adm-card-body">
              <div className="pv-media">
                {mainImg
                  ? <img src={mainImg} alt={name} />
                  : <div className="pv-noimg"><FaImage aria-hidden="true" /><span>No image</span></div>}
              </div>
              {images.length > 1 && (
                <div className="pv-thumbs">
                  {images.map((img, i) => (
                    <button type="button" key={img.imageId || i} className={`pv-thumb${i === active ? " is-active" : ""}`}
                      onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-pressed={i === active}>
                      <img src={img.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header"><h4>Description</h4></div>
            <div className="adm-card-body">
              {description ? <p className="pv-desc">{description}</p> : <p className="adm-muted pv-desc">No description.</p>}
            </div>
          </section>

          {options.length > 0 && (
            <section className="adm-card">
              <div className="adm-card-header"><h4>Options</h4></div>
              <div className="adm-card-body pv-options">
                {options.map((opt) => (
                  <div className="pv-option" key={opt.name}>
                    <div className="pv-option-name">{opt.name}</div>
                    <div className="pv-chips">
                      {(opt.values || []).map((v, i) => (
                        <span className="pv-chip" key={v}>
                          {v}
                          {Number(opt.extras?.[i]) > 0 && <span className="adm-muted"> +{formatPrice(opt.extras[i])}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="adm-card">
            <div className="adm-card-header"><h4>Reviews</h4><span className="adm-muted">{ratings.length} total</span></div>
            <div className="adm-card-body">
              {ratings.length === 0 ? (
                <p className="adm-muted pv-desc">No reviews yet.</p>
              ) : (
                <>
                  <div className="pv-rating-sum">
                    <div className="pv-rating-big">
                      <strong>{avg.toFixed(1)}</strong>
                      <Stars value={avg} />
                      <span className="adm-muted">{ratings.length} review{ratings.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="pv-dist">
                      {dist.map((d) => (
                        <div className="pv-dist-row" key={d.star}>
                          <span>{d.star}</span>
                          <div className="pv-bar"><span style={{ width: `${(d.count / ratings.length) * 100}%` }} /></div>
                          <span className="adm-muted">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ul className="pv-reviews">
                    {ratings.map((r, i) => (
                      <li key={r._id || i}>
                        <div className="pv-review-head">
                          <strong>{r.user?.name || "Deleted user"}</strong>
                          <Stars value={Number(r.rating) || 0} />
                        </div>
                        {r.comment ? <p>{r.comment}</p> : <p className="adm-muted">No comment.</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="pv-side">
          <section className="adm-card">
            <div className="adm-card-header"><h4>Pricing</h4></div>
            <div className="adm-card-body">
              <div className="pv-price">
                <strong>{formatPrice(finalPrice)}</strong>
                {discount > 0 && <s className="adm-muted">{formatPrice(price)}</s>}
              </div>
              <dl className="pv-dl">
                <div><dt>Base price</dt><dd>{formatPrice(price)}</dd></div>
                <div><dt>Discount</dt><dd>{discount > 0 ? `${Math.round(discount)}%` : "None"}</dd></div>
                {discount > 0 && <div><dt>Customer saves</dt><dd>{formatPrice(price - finalPrice)}</dd></div>}
              </dl>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header"><h4>Inventory</h4></div>
            <div className="adm-card-body">
              <dl className="pv-dl">
                <div><dt>Status</dt><dd><StockBadge stock={stock} /></dd></div>
                <div><dt>Units</dt><dd>{Number(stock) || 0}</dd></div>
              </dl>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header"><h4>Organization</h4></div>
            <div className="adm-card-body">
              <dl className="pv-dl">
                <div><dt>Category</dt><dd>{category?.name ?? "—"}</dd></div>
                <div><dt>Brand</dt><dd>{brand || "—"}</dd></div>
                <div><dt>Condition</dt><dd>{condition || "—"}</dd></div>
                <div><dt>Featured</dt><dd>{isFeatured ? "Yes" : "No"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-header"><h4>Details</h4></div>
            <div className="adm-card-body">
              <dl className="pv-dl">
                <div>
                  <dt>Product ID</dt>
                  <dd className="pv-id">
                    <code>{product._id}</code>
                    <button type="button" className="adm-btn ghost sm icon" onClick={copyId} aria-label="Copy product ID">
                      {copied ? <FaCheck /> : <FaCopy />}
                    </button>
                  </dd>
                </div>
                <div><dt>Created</dt><dd>{fmtDate(createdAt)}</dd></div>
                <div><dt>Last updated</dt><dd>{fmtDate(updatedAt)}</dd></div>
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default ProductView;
