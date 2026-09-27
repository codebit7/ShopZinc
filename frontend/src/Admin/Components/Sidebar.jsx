import {
  FiGrid, FiPackage, FiPlusSquare, FiTag, FiShoppingBag, FiCreditCard,
  FiLayers, FiUsers, FiLayout, FiExternalLink, FiLogOut, FiMenu, FiX, FiUser, FiSettings, FiBarChart2, FiImage, FiTruck,
} from "react-icons/fi";
import { FaShoppingCart } from "react-icons/fa";
import { useDispatch } from "react-redux";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { logout } from "../../Store/slices/authSlice";
import "./../Styles/sidebar.css";

// Flat grouped nav. The old collapsible groups held dead placeholder items (Stock, Reports, Pending...).
const GROUPS = [
  { title: "Overview", items: [{ to: "/admin/dashboard", label: "Dashboard", icon: FiGrid }] },
  {
    title: "Catalog",
    items: [
      { to: "/admin/view", label: "Products", icon: FiPackage },
      // `end`: without it /admin/create/:id (edit) also highlights "Add product".
      { to: "/admin/create", label: "Add product", icon: FiPlusSquare, end: true },
      { to: "/admin/categories", label: "Categories", icon: FiTag },
      { to: "/admin/home-sections", label: "Home sections", icon: FiLayout },
      { to: "/admin/carousel", label: "Carousel", icon: FiImage },
    ],
  },
  {
    title: "Sales",
    items: [
      { to: "/admin/orders", label: "Orders", icon: FiShoppingBag },
      { to: "/admin/payments", label: "Payments", icon: FiCreditCard },
      { to: "/admin/courier", label: "Courier", icon: FiTruck },
      { to: "/admin/reports", label: "Reports", icon: FiBarChart2 },
    ],
  },
  { title: "Stock", items: [{ to: "/admin/inventory", label: "Inventory", icon: FiLayers }] },
  { title: "People", items: [{ to: "/admin/customers", label: "Customers", icon: FiUsers }] },
];

const Sidebar = ({ open, expanded, onToggle }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await dispatch(logout()); // thunk clears the session even if the server call fails
    navigate("/auth/login");
  };

  const linkClass = ({ isActive }) => `adm-nav-item${isActive ? " active" : ""}`;

  return (
    <aside className={`adm-sidebar${open ? " open" : ""}`} aria-label="Admin navigation">
      <div className="adm-sidebar-top">
        <Link to="/admin/dashboard" className="adm-brand">
          <FaShoppingCart className="adm-brand-icon" />
          <span className="adm-nav-label">ShopZinc</span>
        </Link>
        {/* Desktop: collapses to the icon rail. Tablet: pins the rail open. Phone: closes the drawer. */}
        <button type="button" className="adm-toggle" aria-label={expanded ? "Collapse menu" : "Expand menu"} aria-expanded={expanded} onClick={onToggle}>
          {open ? <FiX /> : <FiMenu />}
        </button>
      </div>

      <nav className="adm-nav">
        {GROUPS.map((group) => (
          <div className="adm-nav-group" key={group.title}>
            <div className="adm-nav-title">{group.title}</div>
            {group.items.map(({ to, label, icon: Icon, end }) => (
              // title = tooltip when only the icon rail is visible
              <NavLink key={to} to={to} end={end} className={linkClass} title={label}>
                <Icon className="adm-nav-icon" aria-hidden="true" />
                <span className="adm-nav-label">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="adm-sidebar-foot">
        <NavLink to="/admin/profile" className={linkClass} title="My profile">
          <FiUser className="adm-nav-icon" aria-hidden="true" />
          <span className="adm-nav-label">My profile</span>
        </NavLink>
        <NavLink to="/admin/settings" className={linkClass} title="Settings">
          <FiSettings className="adm-nav-icon" aria-hidden="true" />
          <span className="adm-nav-label">Settings</span>
        </NavLink>
        <Link to="/" className="adm-nav-item" title="View store">
          <FiExternalLink className="adm-nav-icon" aria-hidden="true" />
          <span className="adm-nav-label">View store</span>
        </Link>
        <button type="button" className="adm-nav-item" title="Logout" onClick={handleLogout}>
          <FiLogOut className="adm-nav-icon" aria-hidden="true" />
          <span className="adm-nav-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
