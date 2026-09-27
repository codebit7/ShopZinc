import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import "./sideBarMenu.css";
// Font Awesome set replaced by Feather so the drawer matches the navbar icons.
// import { FaHome, FaList, FaHeart, FaShoppingBag, FaGlobe, FaPhone, FaInfoCircle } from "react-icons/fa";
import { FiHome, FiGrid, FiHeart, FiPackage, FiShoppingCart, FiUser, FiLogIn, FiX } from "react-icons/fi";

const SidebarMenu = ({ isOpen, onClose }) => {
  const user = useSelector((state) => state.auth.user);
  const location = useLocation();

  return (
    <div className={`sidebar-overlay ${isOpen ? "open" : ""}`} onClick={onClose}>
      <div className="sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-header">
          <div className="user-icon"></div>
          {/* was a fake "Sign in | Register" label with no link */}
          {user ? (
            <span>{user.name || "My account"}</span>
          ) : (
            <Link to="/auth/login" state={{ from: location }} onClick={onClose}>Sign in | Register</Link>
          )}
          <button className="close-btn" onClick={onClose} aria-label="Close menu"><FiX /></button>
        </div>

        {/* Items were plain <li> text going nowhere; now real routes. Clicking closes the drawer. */}
        <ul className="sidebar-menu">
          <li><Link to="/" onClick={onClose}><FiHome /> Home</Link></li>
          <li><Link to="/filter" onClick={onClose}><FiGrid /> All products</Link></li>
          {user && (
            <>
              <li><Link to="/wishlist" onClick={onClose}><FiHeart /> Wishlist</Link></li>
              <li><Link to="/cart" onClick={onClose}><FiShoppingCart /> Cart</Link></li>
              <li><Link to="/orders" onClick={onClose}><FiPackage /> My orders</Link></li>
              <li><Link to="/profile" onClick={onClose}><FiUser /> Profile</Link></li>
            </>
          )}
          {!user && (
            <li><Link to="/auth/login" state={{ from: location }} onClick={onClose}><FiLogIn /> Log in</Link></li>
          )}
        </ul>

        {/* No pages exist for these yet; hidden until they do. */}
        {/* <ul className="sidebar-menu">
          <li><FaGlobe /> English | USD</li>
          <li><FaPhone /> Contact us</li>
          <li><FaInfoCircle /> About</li>
        </ul>

        <ul className="sidebar-footer">
          <li>User agreement</li>
          <li>Partnership</li>
          <li>Privacy policy</li>
        </ul> */}
      </div>
    </div>
  );
};

export default SidebarMenu;
