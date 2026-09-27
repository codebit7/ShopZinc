import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar, FaRegStar, FaStarHalfAlt, FaHeart, FaRegHeart } from "react-icons/fa";
import { FiMinus, FiPlus } from "react-icons/fi";
import { AddToCartButton, useWishlistToggle } from "../ProductCard/ProductCard";
import placeholder from "./../../assets/Form/file/placeholder-image.jpg";
// Store currency is PKR; shared formatter replaces the hardcoded "$" + toFixed(2).
import { formatPrice } from "../../utils/currency";
import { hasOptions, extraFor, extraOf } from "../../utils/options";
import "./productDetails.css";

// Rebuilt from real product fields only. The old version showed the description as the title
// (BUG-68), an always-on "In stock", "154 sold", invented bulk prices and a fake supplier (BUG-69).

// 0-5 stars with halves, from the real ratings average.
export const Stars = ({ value = 0 }) => (
  <span className="pd-stars" aria-label={`${value.toFixed(1)} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) =>
      value >= i ? <FaStar key={i} /> : value >= i - 0.5 ? <FaStarHalfAlt key={i} /> : <FaRegStar key={i} />
    )}
  </span>
);

export const averageOf = (ratings = []) =>
  ratings.length ? ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length : 0;

const ProductDetail = ({ product }) => {
  const { _id, name, description, price = 0, discount = 0, stock = 0, brand, condition, category, ratings = [] } = product;
  const images = product.images?.length ? product.images : [{ url: placeholder }];
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  // Shopper's choices, e.g. { Size: "M", Color: "Red" }. Nothing is pre-picked on purpose:
  // a silent default would ship the wrong size to someone who didn't look.
  const [picked, setPicked] = useState({});
  const { saved, toggle } = useWishlistToggle(_id);
  const options = hasOptions(product) ? product.options : [];

  // New product (e.g. from Related products) starts on its first photo with quantity 1.
  // useEffect(() => { setActive(0); setQty(1); }, [_id]);
  useEffect(() => { setActive(0); setQty(1); setPicked({}); }, [_id]);

  const avg = averageOf(ratings);
  // const finalPrice = discount > 0 ? price * (1 - discount / 100) : price; // discount is a percent (BUG-62)
  // Picked choices can add an extra price (e.g. 256GB). The percent discount applies to base + extra,
  // same as the server (backend utils/pricing.js), so the cart never shows a different number.
  const listPrice = price + extraFor(product, picked);
  const finalPrice = discount > 0 ? listPrice * (1 - discount / 100) : listPrice; // discount is a percent (BUG-62)
  const stockInfo = stock <= 0 ? { cls: "out", label: "Out of stock" }
    : stock <= 5 ? { cls: "low", label: `Only ${stock} left` }
    : { cls: "in", label: "In stock" };

  return (
    <section className="pd container">
      <div className="pd-gallery">
        <div className="pd-main">
          <img src={images[active]?.url || placeholder} alt={name} />
          {discount > 0 && <span className="pd-badge">-{Math.round(discount)}%</span>} {/* rounded: Rs discounts save as e.g. 33.33% */}
        </div>
        {images.length > 1 && (
          <div className="pd-thumbs">
            {images.map((img, i) => (
              <button
                type="button"
                key={img.imageId || i}
                className={`pd-thumb${i === active ? " active" : ""}`}
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
              >
                <img src={img.url || placeholder} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pd-info">
        <p className="pd-eyebrow">
          {category?.name && <Link to={`/filter?category=${category._id}`}>{category.name}</Link>}
          {category?.name && brand && <span aria-hidden="true"> · </span>}
          {brand}
        </p>
        <h1 className="pd-title">{name}</h1>

        <div className="pd-meta">
          <Stars value={avg} />
          <span className="pd-rating">{avg ? avg.toFixed(1) : "No ratings"}</span>
          <span className="pd-dot" aria-hidden="true" />
          <span>{ratings.length} {ratings.length === 1 ? "review" : "reviews"}</span>
          <span className={`pd-stock ${stockInfo.cls}`}>{stockInfo.label}</span>
        </div>

        <div className="pd-price">
          <span className="pd-now">{formatPrice(finalPrice)}</span>
          {discount > 0 && (
            <>
              <span className="pd-was">{formatPrice(listPrice)}</span>
              <span className="pd-save">Save {formatPrice(listPrice - finalPrice)}</span>
            </>
          )}
        </div>

        {description && <p className="pd-desc">{description}</p>}

        {/* Shown only when the admin added choices to this product. */}
        {options.map((opt) => (
          <div className="pd-option" key={opt.name}>
            <p className="pd-option-label" id={`pd-opt-${opt.name}`}>
              {opt.name}: <strong>{picked[opt.name] || "Choose one"}</strong>
            </p>
            <div className="pd-option-values" role="radiogroup" aria-labelledby={`pd-opt-${opt.name}`}>
              {opt.values.map((v) => (
                <button
                  type="button"
                  key={v}
                  role="radio"
                  aria-checked={picked[opt.name] === v}
                  className={`pd-chip${picked[opt.name] === v ? " on" : ""}`}
                  onClick={() => setPicked((prev) => ({ ...prev, [opt.name]: v }))}
                >
                  {v}
                  {extraOf(opt, v) > 0 && <span className="pd-chip-extra">+{formatPrice(extraOf(opt, v))}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pd-buy">
          <div className="pd-qty" aria-label="Quantity">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1 || stock <= 0} aria-label="Decrease quantity"><FiMinus /></button>
            <span aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(stock, q + 1))} disabled={qty >= stock} aria-label="Increase quantity"><FiPlus /></button>
          </div>
          {/* <div className="pd-cart"><AddToCartButton product={product} quantity={qty} /></div> */}
          <div className="pd-cart"><AddToCartButton product={product} quantity={qty} selected={picked} /></div>
          <button
            type="button"
            className={`pd-wish${saved ? " on" : ""}`}
            onClick={toggle}
            aria-pressed={saved}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            title={saved ? "Remove from wishlist" : "Add to wishlist"}
          >
            {saved ? <FaHeart /> : <FaRegHeart />}
          </button>
        </div>

        <dl className="pd-specs">
          <div><dt>Brand</dt><dd>{brand || "—"}</dd></div>
          <div><dt>Condition</dt><dd>{condition || "—"}</dd></div>
          <div><dt>Category</dt><dd>{category?.name || "—"}</dd></div>
          <div><dt>Availability</dt><dd>{stock > 0 ? `${stock} in stock` : "Out of stock"}</dd></div>
        </dl>
      </div>
    </section>
  );
};

export default ProductDetail;
