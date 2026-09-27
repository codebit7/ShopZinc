import React from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { formatPrice } from "../../utils/currency";
import "./homeExtras.css";

// A logged-in shopper who left items in the cart gets a short way back to it.
// HomeLayout already loads the cart for logged-in users, so this only reads redux (no extra request).
const CartReminder = () => {
  const user = useSelector((state) => state.auth.user);
  const { items = [], total = 0 } = useSelector((state) => state.cart || {});

  if (!user || items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <section className="hx-section container">
      <div className="hx-cart">
        <span>
          You have <strong>{count}</strong> {count === 1 ? "item" : "items"} in your cart
          {" "}(<strong>{formatPrice(total)}</strong>).
        </span>
        <div className="hx-cart-actions">
          <Link to="/cart" className="hx-link">View cart</Link>
          <Link to="/checkout" className="hx-cart-btn">Checkout</Link>
        </div>
      </div>
    </section>
  );
};

export default CartReminder;
