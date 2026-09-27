import React from "react";
import "./productList.css";
import { FaRegHeart, FaHeart } from "react-icons/fa";
import placeHolderImage from './../../assets/Form/file/placeholder-image.jpg';
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { addToWishlist, removeToWishlist } from "../../Store/slices/wishList";
import { AddToCartButton } from "../ProductCard/ProductCard";
// Store currency is PKR; shared formatter replaces the hardcoded "$" + toFixed(2).
import { formatPrice } from "../../utils/currency";
import { hasExtras } from "../../utils/options";

export const calculateRating = (product) => {
  if (!product || !product.ratings || product.ratings.length === 0) {
    return 0;
  }

  const sum = product.ratings.reduce((acc, ratingObj) => acc + ratingObj.rating, 0);
  return (sum / product.ratings.length).toFixed(1);
};

// Filled and empty stars for a 0–5 rating, rounded to the nearest whole star.
const starText = (rating) => {
  const full = Math.round(Number(rating) || 0);
  return "★".repeat(full) + "☆".repeat(5 - full);
};

// Shared by ProductList and ProductGrid. Without these, a search with no match showed a blank area,
// and the old results stayed on screen while the next page/filter was still loading.
const SK = "var(--sz-border)";
const skBlock = (w, h) => ({ width: w, height: h, borderRadius: 6, background: SK, animation: "sz-sk-pulse 1.2s ease-in-out infinite" });
const SkeletonStyle = () => <style>{"@keyframes sz-sk-pulse{0%,100%{opacity:1}50%{opacity:.45}}"}</style>;

export const ProductsSkeleton = ({ grid = false, count = 4 }) => (
  <div className={grid ? "pc-grid" : "product-list"} aria-busy="true" aria-label="Loading products">
    <SkeletonStyle />
    {[...Array(count)].map((_, i) =>
      grid ? (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: `1px solid ${SK}`, borderRadius: "var(--sz-radius)", background: "var(--sz-card)" }}>
          <div style={skBlock("100%", 150)} />
          <div style={skBlock("60%", 14)} />
          <div style={skBlock("85%", 12)} />
        </div>
      ) : (
        <div key={i} className="list-product-card" style={{ cursor: "default" }}>
          <div style={{ ...skBlock(168, 168), flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <div style={skBlock("55%", 18)} />
            <div style={skBlock("25%", 16)} />
            <div style={skBlock("90%", 12)} />
            <div style={skBlock("75%", 12)} />
          </div>
        </div>
      )
    )}
  </div>
);

export const ProductsEmpty = ({ onClear }) => (
  <div role="status" style={{ padding: "48px 24px", textAlign: "center", background: "var(--sz-card)", border: "1px solid var(--sz-border)", borderRadius: "var(--sz-radius)" }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "var(--sz-text)" }}>No products found</h3>
    <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--sz-muted)" }}>
      Try a different search word, or remove some filters.
    </p>
    {onClear && (
      <button
        type="button"
        onClick={onClear}
        style={{ height: 38, padding: "0 18px", border: "1px solid var(--sz-primary)", borderRadius: 6, background: "var(--sz-card)", color: "var(--sz-primary)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
      >
        Clear filters
      </button>
    )}
  </div>
);

const ProductList = ({ products, loading = false, onClear }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  // hearts read the server wishlist from redux — local state reset on navigation (BUG-71)
  const wishList = useSelector((state) => state.wishlist.wishList);
  // const isWishlisted = (id) => wishList.some((p) => p._id === id);
  // Why: before the wishlist loads it may not be an array, and items can be bare ids — .some crashed the list (BUG-61).
  const isWishlisted = (id) => Array.isArray(wishList) && wishList.some((p) => (p?._id || p) === id);
  const user = useSelector((state) => state.auth.user);

  const handleWishlistClick = (e, productId) => {
    e.stopPropagation(); // Prevent card click
    // guests can browse but the wishlist API needs login — send them there instead of a 401
    // `from` brings them back to this page (with its filters) after login
    if (!user) return navigate("/auth/login", { state: { from: location } });

    if (isWishlisted(productId)) {
      dispatch(removeToWishlist(productId));
    } else {
      dispatch(addToWishlist(productId));
    }
  };

  if (loading) return <ProductsSkeleton />;
  if (!products || products.length === 0) return <ProductsEmpty onClear={onClear} />;

  return (
    <div className="product-list">
      {products.map((product) => (
        <div
          className="list-product-card"
          key={product._id}
          onClick={() => navigate(`/product/${product._id}`)}
        >
          <img
            /* src={product.images[0]?.url || placeHolderImage} */
            /* Why: a product saved with no images array crashed the whole list (BUG-61). */
            src={product.images?.[0]?.url || placeHolderImage}
            alt={product.name}
            className="list-product-image"
          />

          <div className="list-product-details">
            <div className="headerbox">
              <h3 className="list-product-title">{product.name}</h3>
              <span className="wishList-icon">
                {isWishlisted(product._id) ? (
                  <FaHeart
                    className="wishlist-icon filled"
                    onClick={(e) => handleWishlistClick(e, product._id)}
                  />
                ) : (
                  <FaRegHeart
                    className="wishlist-icon"
                    onClick={(e) => handleWishlistClick(e, product._id)}
                  />
                )}
              </span>
            </div>

            <div className="list-product-pricing">
              <span className="list-price">
                {/* "From": some choices cost more, so this is the lowest price, not the only one. */}
                {hasExtras(product) && "From "}
                {formatPrice(product.discount > 0
                  ? product.price * (1 - product.discount / 100) /* discount is a percent (BUG-62) */
                  : product.price)}
              </span>
              {product.discount > 0 && (
                <span className="list-original-price">
                  {formatPrice(product.price)}
                </span>
              )}
            </div>

            <div className="list-product-rating">
              {/* ⭐⭐⭐⭐⭐{" "} */}
              {/* Why: it always showed 5 stars, even for a product rated 2 (BUG-66). */}
              <span className="list-stars" aria-hidden="true">{starText(calculateRating(product))}</span>{" "}
              <span className="list-rating-score">{calculateRating(product)}</span> • {(product.ratings || []).length} {(product.ratings || []).length === 1 ? "review" : "reviews"}{" "}{/* was a hardcoded "32 orders" */}
              {/* Product has no freeShipping field, so this never showed anything real (BUG-66). */}
              {/* {product.freeShipping && <span className="list-free-shipping">• Free Shipping</span>} */}
            </div>

            <p className="list-product-description">{product.description}</p>
            {/* stopPropagation: the whole row navigates to the product, the cart click must not. */}
            <div className="list-product-actions" onClick={(e) => e.stopPropagation()}>
              <AddToCartButton product={product} />
              <a href="#" className="view-details" onClick={(e) => { e.preventDefault(); navigate(`/product/${product._id}`); }}>
                View details
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProductList;
