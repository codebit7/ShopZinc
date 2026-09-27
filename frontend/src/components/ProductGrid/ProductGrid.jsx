import React from "react";
import "./productGrid.css";
import { FaRegHeart, FaHeart } from "react-icons/fa";
import placeholderImage from "./../../assets/Form/file/placeholder-image.jpg";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { addToWishlist, removeToWishlist } from "../../Store/slices/wishList";
import ProductCard from "../ProductCard/ProductCard";
import { ProductsEmpty, ProductsSkeleton } from "../ProductList/ProductList";

export const calculateReviews = (product) => {
  if (!product || !product.ratings) {
    return 0;
  }

  return product.ratings.filter(
    (p) => p.comment && p.comment.trim() !== ""
  ).length;
};

const ProductGrid = ({ products, loading = false, onClear }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  // hearts read the server wishlist from redux — local state reset on navigation (BUG-71)
  const wishList = useSelector((state) => state.wishlist.wishList);
  const isWishlisted = (id) => wishList.some((p) => p._id === id);
  const user = useSelector((state) => state.auth.user);

  const handleWishList = (e, productId) => {
    e.stopPropagation();
    // guests can browse but the wishlist API needs login — send them there instead of a 401
    // `from` brings them back to this page (with its filters) after login
    if (!user) return navigate("/auth/login", { state: { from: location } });

    if (isWishlisted(productId)) {
      dispatch(removeToWishlist(productId));
    } else {
      dispatch(addToWishlist(productId));
    }
  };

  const handleCardClick = (e, productId) => {
   
    if (!e.target.closest(".wishlist-icon")) {
      navigate(`/product/${productId}`);
    }
  };

  // Shared card: same heart, badge and add-to-cart as the rest of the store; also no crash on a
  // missing averageRating (BUG-60). The old card markup is kept below, commented out.
  // Same loading/empty blocks as the list view (see ProductList).
  if (loading) return <ProductsSkeleton grid count={8} />;
  if (!products || products.length === 0) return <ProductsEmpty onClear={onClear} />;

  return (
    <div className="pc-grid">
      {products.map((product) => <ProductCard key={product._id} product={product} />)}
    </div>
  );

  /* return (
    <div className="product-grid">
      {products.map((product) => (
        <div
          className="p-card"
          key={product._id}
          onClick={(e) => handleCardClick(e, product._id)}
        >
          <div className="product-image-container">
            <img
              src={product.images[0]?.url || placeholderImage}
              alt={product.name}
              className="product-image"
            />
            -- heart sits over the image, top-right (inner comment markers removed so the outer comment holds) --
            <span className="wishList-icon">
              {isWishlisted(product._id) ? (
                <FaHeart
                  className="wishlist-icon filled"
                  onClick={(e) => handleWishList(e, product._id)}
                />
              ) : (
                <FaRegHeart
                  className="wishlist-icon"
                  onClick={(e) => handleWishList(e, product._id)}
                />
              )}
            </span>
          </div>

          <div className="product-info">
            <div className="price-section">
              <div className="product-pricing">
                <span className="price">
                  $
                  {product.discount > 0
                    ? (product.price * (1 - product.discount / 100)).toFixed(2) // discount is a percent (BUG-62)
                    : product.price.toFixed(2)}
                </span>
                {product.discount > 0 && (
                  <span className="old-price">${product.price.toFixed(2)}</span>
                )}
              </div>
            </div>

            <div className="product-rating">
              ⭐⭐⭐⭐⭐{" "}
              <span className="rating-value">
                {product.averageRating.toFixed(1)}
              </span>
              <span className="reviews">({calculateReviews(product)})</span>
            </div>

            <p className="grid-product-title">{product.name}</p>
          </div>
        </div>
      ))}
    </div>
  ); */
};

export default ProductGrid;
