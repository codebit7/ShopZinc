import { useState } from "preact/hooks";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FiHeart, FiLogOut, FiMapPin, FiPackage, FiUser } from "react-icons/fi";
import { logout } from "../../Store/slices/authSlice";
import "./account.css";

// Shared shell for /profile and /orders: one nav, so every account page is one click from the others.
const AccountLayout = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const wishList = useSelector((s) => s.wishlist.wishList);
  const [loggingOut, setLoggingOut] = useState(false);

  const wishCount = Array.isArray(wishList) ? wishList.length : 0;

  const handleLogout = async () => {
    setLoggingOut(true);
    await dispatch(logout()); // thunk clears the session even if the server call fails
    navigate("/");
  };

  const linkClass = ({ isActive }) => `acc-nav-link${isActive ? " is-active" : ""}`;

  return (
    <div className="acc container">
      <aside className="acc-side">
        <div className="acc-side-head">
          <p className="acc-eyebrow">My account</p>
          {user && <p className="acc-side-name">{user.name}</p>}
        </div>
        <nav className="acc-nav" aria-label="Account">
          {/* `end` so Overview is not also active on /profile/addresses */}
          <NavLink to="/profile" end className={linkClass}>
            <FiUser aria-hidden="true" /> <span>Overview</span>
          </NavLink>
          <NavLink to="/orders" className={linkClass}>
            <FiPackage aria-hidden="true" /> <span>Orders</span>
          </NavLink>
          <NavLink to="/profile/addresses" className={linkClass}>
            <FiMapPin aria-hidden="true" /> <span>Addresses</span>
          </NavLink>
          <NavLink to="/wishlist" className={linkClass}>
            <FiHeart aria-hidden="true" /> <span>Wishlist</span>
            {wishCount > 0 && <span className="acc-nav-count">{wishCount}</span>}
          </NavLink>
          <button type="button" className="acc-nav-link acc-nav-logout" onClick={handleLogout} disabled={loggingOut}>
            <FiLogOut aria-hidden="true" /> <span>{loggingOut ? "Logging out…" : "Log out"}</span>
          </button>
        </nav>
      </aside>
      <main className="acc-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AccountLayout;
