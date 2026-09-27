import { FiMoon, FiSun, FiBell, FiSettings, FiSearch, FiMenu } from "react-icons/fi";
import { useSelector } from "react-redux";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import './../Styles/navbar.css'

// Title follows the route; it used to be hardcoded "CREATE PRODUCT" on every page.
const TITLES = [
  ["/admin/view", "Products"],
  ["/admin/create/", "Edit Product"],
  ["/admin/create", "Add Product"],
  ["/admin/categories", "Categories"],
  ["/admin/dashboard", "Dashboard"],
  ["/admin/orders", "Orders"],
  ["/admin/payments", "Payments"],
  ["/admin/courier", "Courier"],
  ["/admin/inventory", "Inventory"],
  ["/admin/customers", "Customers"],
  ["/admin/home-sections", "Home sections"],
  ["/admin/profile", "My profile"],
  ["/admin/settings", "Settings"],
  ["/admin/reports", "Reports"],
  ["/admin/carousel", "Carousel"],
];
// Fallback was "Products", so unknown admin paths (the not-found card) got a wrong header.
const pageTitle = (path) => TITLES.find(([p]) => path.startsWith(p))?.[1] || "Page not found";

// Theme state lives in AdminLayout: the dark class has to sit on the layout root, not the navbar.
const Navbar = ({ onMenu, dark, onToggleTheme }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // The top search used to be a bare input with no handler, so typing in it did nothing.
  const [text, setText] = useState("");
  const onSearch = (e) => {
    e.preventDefault();
    const q = text.trim();
    // Products is the only admin page with a server search; it reads ?q= from the URL.
    navigate(q ? `/admin/view?q=${encodeURIComponent(q)}` : "/admin/view");
  };
  const user = useSelector((state) => state.auth.user);
  // Initial avatar instead of the old randomuser.me photo — no third-party request, shows the real admin.
  const name = user?.name || "Admin";

  return (
    <header className="adm-navbar">
      {/* Only visible on phones, where the sidebar is an off-canvas drawer. */}
      <button type="button" className="adm-icon-btn adm-menu-btn" aria-label="Open menu" onClick={onMenu}>
        <FiMenu />
      </button>
      <h1 className="adm-page-title">{pageTitle(pathname)}</h1>

      <div className="adm-navbar-right">
        {/* Was a <label> with a dead input; a form (same class, same look) makes Enter submit. */}
        {/* <label className="adm-topsearch">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search..." aria-label="Search" />
        </label> */}
        <form className="adm-topsearch" role="search" onSubmit={onSearch}>
          <FiSearch aria-hidden="true" />
          <input
            type="search"
            placeholder="Search products..."
            aria-label="Search products"
            value={text}
            onInput={(e) => setText(e.target.value)}
          />
        </form>

        <button type="button" className="adm-icon-btn adm-hide-sm" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>
          {dark ? <FiSun /> : <FiMoon />}
        </button>
        <button type="button" className="adm-icon-btn" aria-label="Notifications">
          <FiBell />
          <span className="adm-dot" />
        </button>
        {/* Had no handler, so clicking it did nothing. Opens the admin panel settings page. */}
        <button type="button" className="adm-icon-btn adm-hide-sm" aria-label="Settings" title="Settings" onClick={() => navigate("/admin/settings")}>
          <FiSettings />
        </button>

        {/* <div className="adm-user"> ... </div> — now a button: the usual place to find "my profile". */}
        <button type="button" className="adm-user adm-user-btn" onClick={() => navigate("/admin/profile")} aria-label="My profile" title="My profile">
          <span className="adm-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
          <span className="adm-user-name">{name}</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
