import React, { useEffect, useState } from "react";
import "./shoppingCart.css";
import img1 from "./../../assets/Image/tech/1.png";
import img2 from "./../../assets/Image/tech/2.png";
import img3 from "./../../assets/Image/tech/3.png";
import { FaArrowLeft, FaMinus, FaPlus } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "../../utils/currency";
import { clearCart, deleteCartItem, getCartItems, updateCartItem } from "../../Store/slices/cartSlice";
import { formatSelected } from "../../utils/options";
import placeholder  from './../../assets/Form/file/placeholder-image.jpg'

const initialCartItems = [
  {
    id: 1,
    image: img1,
    title: "T-shirts with multiple colors, for men and lady",
    size: "Medium",
    color: "Blue",
    material: "Plastic",
    seller: "Artel Market",
    price: 78.99,
    quantity: 1,
  },
  {
    id: 2,
    image: img2,
    title: "T-shirts with multiple colors, for men and lady",
    size: "Medium",
    color: "Blue",
    material: "Plastic",
    seller: "Best Factory LLC",
    price: 39.0,
    quantity: 2,
  },
  {
    id: 3,
    image: img3,
    title: "T-shirts with multiple colors, for men and lady",
    size: "Medium",
    color: "Blue",
    material: "Plastic",
    seller: "Artel Market",
    price: 170.5,
    quantity: 1,
  },
];

// Why: money comes from the server as numbers; this only formats, it never calculates.
// Store currency is PKR; formatPrice adds the "Rs" itself, so the "$" before each call is gone.
// const money = (n) => (Number(n) || 0).toFixed(2);
const money = formatPrice;

const ShoppingCart = () => {

  const cart = useSelector((state)=>state.cart ?? {items:[], subtotal:0, discount:0, total:0});
  console.log("Cart: ");

  const [coupon, setCoupon] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Why commented out: fake Size/Color/Material/Seller shown on every line. Real choices come
  // from item.selected now.
  // const temData ={
  //   size: "Medium",
  //   color: "Blue",
  //   material: "Plastic",
  //   seller: "Artel Market",
  // }





  // itemId = cart line _id: "Shirt M" and "Shirt L" are two lines of one product.
  const updateQuantity = (itemId, quantity) => {
       // Backend rejects quantity < 1 with 400, so going below 1 means "remove the item" (BUG-15).
       if (quantity < 1) return removeItem(itemId);
       dispatch(updateCartItem({itemId, quantity}));
  };


  const removeItem = (id) => {
   dispatch(deleteCartItem(id))
  };


  const removeAll = () => {
    dispatch(clearCart())
  };

  // Why commented out: the UI invented a 5% discount and a 10% tax. The server now returns the
  // real subtotal / discount / total (percent product discounts), and there is no tax rule anywhere.
  // const discount = cart.total * (5 / 100);
  // const tax = (cart.total - discount) * (10 / 100);
  // const grandTotal = cart.total - discount + tax;





  useEffect(() => {
    if (cart.items.length === 0) {
      dispatch(getCartItems());
    }
  }, [dispatch, cart.items.length]);

  return (
    <>
      <h3 className="container cart-count">My Cart ({cart.items.length})</h3>
      <div className="main-shopping-cart container">

        <div className="shopping-cart">
          {cart.items.length > 0 ? (
            // Why the filter: a line whose product was deleted has product null and crashed here.
            cart.items.filter((item) => item.product).map((item) => (
              <div key={item._id || item.product._id} className="cart-item">

                <div className="cart-content-box">
                <div className="cart-item-image">
                  {/* Why: the model field is images[], not image (BUG-64). */}
                  <img src={item.product.images?.[0]?.url || placeholder} alt={item.product.name} />
                </div>


                <div className="cart-item-details">
                  <h4>{item.product.name}</h4>
                  {/* <p>
                    <span>Size: {item.product?.size ||temData.size}, </span>
                    <span>Color: {item.product?.color || temData.color}, </span>
                    <span>Material: {item.product?.material || temData.material}</span>
                  </p>
                  <p className="seller">Seller: {item.product?.seller || temData.seller}</p> */}
                  {formatSelected(item.selected) && <p>{formatSelected(item.selected)}</p>}
                  <div className="cart-buttons">
                    <button className="remove-btn" onClick={() => removeItem(item._id || item.product._id)}>
                      Remove
                    </button>
                    <button className="save-btn">Save for later</button>
                  </div>
                </div>

                </div>

                <div className="cart-item-price">
                  {/* Why: show what the buyer actually pays per unit (server-computed, after discount). */}
                  {/* <strong>${item.product.price.toFixed(2)}</strong> */}
                  <strong>{money(item.unitPrice ?? item.product.price)}</strong>
                  <div className="quantity-controls">
                    <button
                      onClick={() => updateQuantity(item._id || item.product._id, item.quantity - 1)}
                      aria-label={item.quantity <= 1 ? "Remove item" : "Decrease quantity"}
                      disabled={cart.loading}
                    >
                      <FaMinus />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item._id || item.product._id, item.quantity + 1)}
                      aria-label="Increase quantity"
                      // Why: the server rejects more than stock; don't offer a click that must fail.
                      disabled={cart.loading || item.quantity >= (item.product.stock ?? Infinity)}
                    >
                      <FaPlus />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-cart">
              <p className="empty-cart-title">Your cart is empty.</p>
              <p className="empty-cart-text">Find something you like and add it here.</p>
              <Link to="/filter" className="empty-cart-link">Continue shopping</Link>
            </div>
          )}


          <div className="cart-footer">
            <button className="back-btn">
              <FaArrowLeft /> Back to shop
            </button>
            {cart.items.length > 0 && (
              <button className="remove-all-btn" onClick={removeAll}>
                Remove all
              </button>
            )}
          </div>
        </div>


        <div className="checkout-summary">

          <div className="coupon-section">
            <label>Have a coupon?</label>
            <div className="coupon-input">
              <input
                type="text"
                placeholder="Add coupon"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
              />
              <button>Apply</button>
            </div>
          </div>


          <div className="summary-box">
            {/* Why: the server's message (e.g. "Only 3 left") tells the user why a change didn't apply. */}
            {cart.error && <p className="cart-error" role="alert">{cart.error}</p>}
            <p>Subtotal: <span>{money(cart.subtotal)}</span></p>
            <p className="discount">Discount: <span>- {money(cart.discount)}</span></p>
            {/* <p className="tax">Tax: <span> + ${tax.toFixed(2)}</span></p> */}
            <p>Delivery: <span>{cart.shippingFee > 0 ? money(cart.shippingFee) : "Free"}</span></p>
            {/* Nudge only when a free-delivery threshold exists and is not reached yet. */}
            {cart.shippingFee > 0 && cart.freeShippingFrom > cart.total && (
              <p className="cart-free-hint">Add {money(cart.freeShippingFrom - cart.total)} more for free delivery.</p>
            )}
            {/* <p className="total">
              <strong>Total:</strong> <strong>{money(cart.total)}</strong>
            </p> */}
            <p className="total">
              <strong>Total:</strong> <strong>{money(cart.grandTotal)}</strong>
            </p>


            {/* Why: this button had no handler (BUG-65). */}
            <button
              className="checkout-btn"
              onClick={() => navigate("/checkout")}
              disabled={cart.items.length === 0}
            >
              Checkout
            </button>


            {/* Hidden: the store takes none of these cards — only cash on delivery (BUG-66).
                The real methods are shown at checkout, from /payments/methods. */}
            {/* <div className="payment-icons">
              <img src="https://img.icons8.com/color/48/000000/amex.png" alt="Amex" />
              <img src="https://img.icons8.com/color/48/000000/mastercard.png" alt="MasterCard" />
              <img src="https://img.icons8.com/color/48/000000/paypal.png" alt="PayPal" />
              <img src="https://img.icons8.com/color/48/000000/visa.png" alt="Visa" />
              <img src="https://img.icons8.com/color/48/000000/apple-pay.png" alt="Apple Pay" />
            </div> */}
          </div>
        </div>
      </div>
    </>
  );
};

export default ShoppingCart;
