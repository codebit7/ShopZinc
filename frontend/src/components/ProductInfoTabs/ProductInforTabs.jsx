import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { FaStar, FaRegStar } from "react-icons/fa";
import { FiCheckCircle, FiEdit2, FiTrash2 } from "react-icons/fi";
import api from "../../api/client";
import "./productInfoTabs.css";
import { Stars, averageOf } from "../ProductDetails/ProductDetails";

// Real product data only. The old tabs were lorem ipsum, a hardcoded spec table, and empty
// "Shipping" / "About seller" tabs with nothing behind them in the database.
// Reviews: buyers only (a delivered order with this product), one per user, editable/deletable by
// the author; admins can delete any. Rules live in backend controllers/reviewController.js.

const MAX_COMMENT = 1000;
const STAR_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
};
const sameId = (a, b) => a && b && String(a._id || a) === String(b._id || b);

// Clickable 1-5 stars. A radio group underneath, so keyboard and screen readers work too.
const StarPicker = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="rv-picker">
      <div className="rv-picker-stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"} - ${STAR_WORDS[n]}`}
            className={`rv-star${n <= shown ? " on" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, (value || 1) - 1)); }
            }}
            tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
          >
            {n <= shown ? <FaStar /> : <FaRegStar />}
          </button>
        ))}
      </div>
      <span className="rv-picker-word" aria-live="polite">{shown ? STAR_WORDS[shown] : "Tap a star"}</span>
    </div>
  );
};

// Write / edit form, or the reason the user can't write one.
const ReviewBox = ({ product, mine, onSaved }) => {
  const user = useSelector((s) => s.auth.user);
  const location = useLocation();
  const [elig, setElig] = useState({ loading: true, canReview: false, reason: "" });
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState({ saving: false, error: "", done: "" });

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setElig({ loading: true, canReview: false, reason: "" });
    api.get(`/product/${product._id}/reviews/eligibility`)
      .then((res) => alive && setElig({ loading: false, canReview: res.data.canReview, reason: res.data.reason || "" }))
      .catch(() => alive && setElig({ loading: false, canReview: false, reason: "Could not check if you can review this product." }));
    return () => { alive = false; };
  }, [product._id, user?.id]);

  // Hide "Thanks..." after a moment.
  useEffect(() => {
    if (!status.done) return;
    const t = setTimeout(() => setStatus((s) => ({ ...s, done: "" })), 3000);
    return () => clearTimeout(t);
  }, [status.done]);

  if (!user) {
    return (
      <div className="rv-box rv-box--muted">
        <p><Link to="/auth/login" state={{ from: location }}>Log in</Link> to write a review.</p>
      </div>
    );
  }
  if (elig.loading) return <div className="rv-box rv-box--muted"><p>Checking…</p></div>;

  const startEdit = () => {
    setRating(mine?.rating || 0);
    setComment(mine?.comment || "");
    setStatus({ saving: false, error: "", done: "" });
    setEditing(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setStatus({ saving: false, error: "Please choose a star rating.", done: "" }); return; }
    setStatus({ saving: true, error: "", done: "" });
    try {
      const res = await api.post(`/product/${product._id}/reviews`, { rating, comment });
      onSaved(res.data);
      setEditing(false);
      setStatus({ saving: false, error: "", done: mine ? "Your review was updated." : "Thanks! Your review is live." });
    } catch (err) {
      setStatus({ saving: false, error: err.response?.data?.message || "Could not save your review.", done: "" });
    }
  };

  if (!elig.canReview && !mine) {
    return <div className="rv-box rv-box--muted"><p>{elig.reason}</p></div>;
  }

  if (!editing) {
    return (
      <div className="rv-box rv-box--cta">
        <div>
          <strong>{mine ? "You reviewed this product" : "Bought this product?"}</strong>
          <p>{status.done || (mine ? "You can change your review at any time." : "Share what you think to help other shoppers.")}</p>
        </div>
        {elig.canReview && (
          <button type="button" className="rv-btn primary" onClick={startEdit}>
            {mine ? <><FiEdit2 aria-hidden="true" /> Edit your review</> : "Write a review"}
          </button>
        )}
      </div>
    );
  }

  return (
    <form className="rv-box rv-form" onSubmit={submit}>
      <strong>{mine ? "Edit your review" : "Write a review"}</strong>
      <StarPicker value={rating} onChange={setRating} />
      <label className="rv-label" htmlFor="rv-comment">Your review <span>(optional)</span></label>
      <textarea
        id="rv-comment"
        className="rv-textarea"
        rows={4}
        maxLength={MAX_COMMENT}
        placeholder="What did you like or dislike? How was the quality?"
        value={comment}
        onInput={(e) => setComment(e.target.value)}
      />
      <div className="rv-form-foot">
        <span className="rv-count">{comment.length} / {MAX_COMMENT}</span>
        {status.error && <span className="rv-error" role="alert">{status.error}</span>}
        <div className="rv-form-actions">
          <button type="button" className="rv-btn ghost" onClick={() => setEditing(false)} disabled={status.saving}>Cancel</button>
          <button type="submit" className="rv-btn primary" disabled={status.saving}>
            {status.saving ? "Saving..." : mine ? "Update review" : "Post review"}
          </button>
        </div>
      </div>
    </form>
  );
};

const ProductInfoTabs = ({ product = {}, onReviewsChange }) => {
  const [activeTab, setActiveTab] = useState("description");
  const user = useSelector((s) => s.auth.user);
  const ratings = product.ratings || [];
  const avg = averageOf(ratings);
  const [deleting, setDeleting] = useState("");

  // A different product (Related products click) opens on its description again.
  useEffect(() => setActiveTab("description"), [product._id]);

  const tabs = [
    { key: "description", label: "Description" },
    { key: "reviews", label: `Reviews (${ratings.length})` },
  ];

  const mine = user ? ratings.find((r) => sameId(r.user, user.id)) : null;
  // Newest first, but the user's own review always on top.
  const sorted = [...ratings].sort((a, b) => {
    if (mine && a === mine) return -1;
    if (mine && b === mine) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  // 5-to-1 breakdown bars.
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({ n, count: ratings.filter((r) => Math.round(r.rating) === n).length }));

  const remove = async (r) => {
    if (!window.confirm(sameId(r.user, user?.id) ? "Delete your review?" : "Delete this review? (admin)")) return;
    setDeleting(r._id);
    try {
      const res = await api.delete(`/product/${product._id}/reviews/${r._id}`);
      onReviewsChange?.(res.data);
    } catch (err) {
      alert(err.response?.data?.message || "Could not delete the review.");
    } finally {
      setDeleting("");
    }
  };

  return (
    <div className="product-tabs-container" id="reviews">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "description" && (
          <p className="description-text">{product.description || "No description yet."}</p>
        )}

        {activeTab === "reviews" && (
          <div className="reviews">
            <div className="rv-top">
              <div className="reviews-summary">
                <span className="reviews-score">{ratings.length ? avg.toFixed(1) : "–"}</span>
                <div>
                  <Stars value={avg} />
                  <p>{ratings.length ? `Based on ${ratings.length} ${ratings.length === 1 ? "review" : "reviews"}` : "No reviews yet"}</p>
                </div>
              </div>
              {ratings.length > 0 && (
                <ul className="rv-bars" aria-label="Rating breakdown">
                  {breakdown.map(({ n, count }) => (
                    <li key={n}>
                      <span className="rv-bars-label">{n} <FaStar aria-hidden="true" /></span>
                      <span className="rv-bars-track"><span className="rv-bars-fill" style={{ width: `${(count / ratings.length) * 100}%` }} /></span>
                      <span className="rv-bars-count">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ReviewBox product={product} mine={mine} onSaved={(data) => onReviewsChange?.(data)} />

            {sorted.length > 0 && (
              <ul className="reviews-list">
                {sorted.map((r, i) => {
                  // user is populated by GET /product/:id; list payloads only carry the id.
                  const who = r.user?.name || "Customer";
                  const isMine = mine && r === mine;
                  const canDelete = user && (isMine || user.role === "admin");
                  return (
                    <li key={r._id || i} className={`review${isMine ? " is-mine" : ""}`}>
                      <span className="review-avatar" aria-hidden="true">{who.charAt(0).toUpperCase()}</span>
                      <div className="review-body">
                        <div className="review-head">
                          <strong>{who}{isMine && <span className="rv-you"> (you)</span>}</strong>
                          <Stars value={r.rating || 0} />
                          {r.verified && <span className="rv-verified"><FiCheckCircle aria-hidden="true" /> Verified purchase</span>}
                          {r.createdAt && <span className="rv-date">{when(r.updatedAt || r.createdAt)}</span>}
                        </div>
                        {r.comment && <p>{r.comment}</p>}
                        {canDelete && (
                          <button type="button" className="rv-delete" onClick={() => remove(r)} disabled={deleting === r._id}>
                            <FiTrash2 aria-hidden="true" /> {deleting === r._id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductInfoTabs;
