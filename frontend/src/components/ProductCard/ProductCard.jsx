import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { FaHeart, FaRegHeart, FaStar } from "react-icons/fa";
import { FiShoppingCart, FiCheck } from "react-icons/fi";
import { addToWishlist, removeToWishlist } from "../../Store/slices/wishList";
import { addCartItem } from "../../Store/slices/cartSlice";
import { hasOptions, hasExtras } from "../../utils/options";
import placeholder from "../../assets/Form/file/placeholder-image.jpg";
// Store currency is PKR; shared formatter replaces the hardcoded "$" + toFixed(2).
import { formatPrice } from "../../utils/currency";
import "./productCard.css";

// Shared cart button: also used by the filter page's list view, so both views behave the same.
// moveToCart: the "saved for later" variant — adding to cart also takes it off the wishlist.
// quantity: the product page sends the picked amount; cards add one.
// selected: { Size: "M", ... } from the product page. Undefined = a card with no pickers.
export const AddToCartButton = ({ product, moveToCart = false, quantity = 1, selected }) => {
  const { _id, stock } = product;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);
  const [cartState, setCartState] = useState("idle"); // idle | busy | added | error
  const outOfStock = stock === 0;
  // A card can't show pickers, so a product with choices sends the shopper to its page instead.
  const needsPage = hasOptions(product) && selected === undefined;
  // On the product page: the first choice still not picked, e.g. "Size".
  const missing = !needsPage && hasOptions(product) ? product.options.find((o) => !selected?.[o.name]) : null;

  const addToCart = async () => {
    if (needsPage) return navigate(`/product/${_id}`);
    // `from` brings the guest back to this page after login.
    if (!user) return navigate("/auth/login", { state: { from: location } }); // cart API needs a session
    setCartState("busy");
    try {
      // await dispatch(addCartItem({ productId: _id, quantity })).unwrap();
      await dispatch(addCartItem({ productId: _id, quantity, selected })).unwrap();
      if (moveToCart) dispatch(removeToWishlist(_id));
      setCartState("added");
    } catch {
      setCartState("error");
    }
    setTimeout(() => setCartState("idle"), 1600);
  };

  const label = outOfStock ? "Out of stock"
    : cartState === "busy" ? "Adding..."
    : cartState === "added" ? "Added"
    : cartState === "error" ? "Try again"
    : needsPage ? "Choose options"
    : missing ? `Choose ${missing.name}`
    : moveToCart ? "Move to cart" : "Add to cart";

  return (
    <button
      type="button"
      className={`pc-cart${cartState === "added" ? " added" : ""}`}
      disabled={outOfStock || cartState === "busy" || Boolean(missing)}
      onClick={addToCart}
    >
      {cartState === "added" ? <FiCheck aria-hidden="true" /> : <FiShoppingCart aria-hidden="true" />}
      {label}
    </button>
  );
};

// Heart logic shared by the card and the product page, so both read and write the same wishlist.
export const useWishlistToggle = (_id) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);
  const wishList = useSelector((state) => state.wishlist.wishList);
  // Wishlist items come back populated; compare ids so the heart matches the server.
  const saved = Array.isArray(wishList) && wishList.some((p) => (p?._id || p) === _id);
  const toggle = () => {
    if (!user) return navigate("/auth/login", { state: { from: location } }); // wishlist API needs a session; `from` returns here after login
    dispatch(saved ? removeToWishlist(_id) : addToWishlist(_id));
  };
  return { saved, toggle };
};

// One card for every product grid (recommended, saved for later, related, filter page), so the
// wishlist heart and add-to-cart behave the same everywhere.
const ProductCard = ({ product, moveToCart = false }) => {
  const { _id, name, price = 0, discount = 0, images, averageRating } = product;
  const { saved, toggle: toggleWish } = useWishlistToggle(_id);
  const finalPrice = discount > 0 ? price * (1 - discount / 100) : price; // discount is a percent (BUG-62)

  return (
    <div className="pc-card">
      <Link to={`/product/${_id}`} className="pc-media">
        <img src={images?.[0]?.url || placeholder} alt={name} loading="lazy" />
        {discount > 0 && <span className="pc-badge">-{Math.round(discount)}%</span>} {/* rounded: Rs discounts save as e.g. 33.33% */}
      </Link>

      <button
        type="button"
        className={`pc-heart${saved ? " on" : ""}`}
        aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={saved}
        onClick={toggleWish}
      >
        {saved ? <FaHeart /> : <FaRegHeart />}
      </button>

      <div className="pc-body">
        <Link to={`/product/${_id}`} className="pc-name" title={name}>{name}</Link>

        {averageRating > 0 && (
          <div className="pc-rating">
            <FaStar className="pc-star" aria-hidden="true" />
            <span>{Number(averageRating).toFixed(1)}</span>
          </div>
        )}

        <div className="pc-price">
          {/* "From": some choices cost more, so this is the lowest price, not the only one. */}
          <span className="pc-now">{hasExtras(product) && "From "}{formatPrice(finalPrice)}</span>
          {discount > 0 && <span className="pc-was">{formatPrice(price)}</span>}
        </div>

        <AddToCartButton product={product} moveToCart={moveToCart} />
      </div>
    </div>
  );
};

export default ProductCard;
