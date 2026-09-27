import { useEffect, useRef, useState } from "preact/hooks";
import { useNavigate, Link, useLocation } from "react-router-dom";
// The image was a placeholder that literally said "Brand"; the logo is now an icon + wordmark.
// import logo from "./../../assets/Brand/logo-colored.png";
import { LuShoppingBag } from "react-icons/lu";
// Old icon set (incl. the Star Wars FaJediOrder icon) replaced by Feather icons for one consistent look.
// import { FaCartShopping, FaUser, FaBars } from "react-icons/fa6";
// import { FaHeart, FaJediOrder } from "react-icons/fa";
// import { MdFavorite, MdMessage } from "react-icons/md";
import {
  FiMenu,
  FiSearch,
  FiX,
  FiHeart,
  FiShoppingCart,
  FiChevronDown,
  FiCheck,
  FiUser,
  FiPackage,
  FiShield,
  FiLogOut,
} from "react-icons/fi";
import "./navStyle.css";
import { useDispatch, useSelector } from "react-redux";
import { updateFilter, fetchCategories } from "../../Store/slices/productSlice";
import { logout } from "../../Store/slices/authSlice";

// Hardcoded names replaced by real categories: the filter page needs the id to filter.
/* const categories = [
  "All",
  "Fashion & Design",
  "Electronics",
  "Home & Kitchen",
  "Health & Beauty",
  "Sports & Outdoors",
  "Automobiles",
]; */
const ALL = { _id: "All", name: "All" };
// Row 2 only has room for a handful; the full list is in the search picker and on /filter.
const ROW2_LIMIT = 7;
// Type-ahead: keys pressed within this window build one search string (WAI-ARIA APG listbox).
const TYPEAHEAD_MS = 500;
const catLabel = (c) => (c._id === ALL._id ? "All categories" : c.name);

const NavBar = ({ setMenuOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const { filters, categories: dbCategories } = useSelector((state) => state.products);
  const user = useSelector((state) => state.auth.user);
  const wishList = useSelector((state) => state.wishlist.wishList);
  const cartItems = useSelector((state) => state.cart.items);

  const [selectedCategory, setSelectedCategory] = useState(ALL._id);
  const [input, setInput] = useState(filters.search || "");
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef(null);
  const accountBtnRef = useRef(null);
  // Custom category picker (replaces the native <select>, which could not be themed).
  const [catOpen, setCatOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const catRef = useRef(null);
  const catBtnRef = useRef(null);
  const catListRef = useRef(null);
  const typeRef = useRef({ buf: "", t: 0 });

  const categories = [ALL, ...dbCategories];
  const selectedIdx = Math.max(0, categories.findIndex((c) => c._id === selectedCategory));

  useEffect(() => {
    if (dbCategories.length === 0) dispatch(fetchCategories());
  }, [dispatch]);

  // Why: the filter page syncs redux from the URL (back/forward, links), so the bar must follow
  // or it shows stale text/category. Typing still only edits local state until submit.
  useEffect(() => {
    setInput(filters.search || "");
  }, [filters.search]);

  // dbCategories is a dep so the picker catches up once categories load; unknown values fall back to All.
  useEffect(() => {
    const known = dbCategories.some((c) => c._id === filters.category);
    setSelectedCategory(known ? filters.category : ALL._id);
  }, [filters.category, dbCategories]);

  // Shadow only once the page scrolls, so the bar sits flat on top of the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menu must not stay open on the next page.
  useEffect(() => {
    setAccountOpen(false);
    setCatOpen(false);
  }, [location.pathname, location.search]);

  // Outside click closes the category picker. pointerdown so touch taps count too.
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e) => {
      if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [catOpen]);

  // Keep the keyboard-active option visible. Scrolls only the list, never the page.
  useEffect(() => {
    const list = catListRef.current;
    const el = catOpen && list ? list.children[activeIdx] : null;
    if (!el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  }, [catOpen, activeIdx]);

  // Outside click and Escape close the account menu.
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setAccountOpen(false);
        accountBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(updateFilter({ key: "search", value: input.trim() }));
    dispatch(updateFilter({ key: "category", value: selectedCategory }));
    navigate("/filter");
  };

  const openCat = (idx = selectedIdx) => {
    setActiveIdx(idx);
    setCatOpen(true);
  };

  const closeCat = (refocus) => {
    setCatOpen(false);
    if (refocus) catBtnRef.current?.focus();
  };

  const pickCat = (idx) => {
    const c = categories[idx];
    if (c) setSelectedCategory(c._id);
    closeCat(true);
  };

  // Returns the next option whose label starts with the typed text; repeating one letter cycles.
  const typeAhead = (char, from) => {
    const now = Date.now();
    const t = typeRef.current;
    t.buf = now - t.t > TYPEAHEAD_MS ? char : t.buf + char;
    t.t = now;
    const q = t.buf.toLowerCase();
    const same = q.split("").every((ch) => ch === q[0]);
    const needle = same ? q[0] : q;
    const n = categories.length;
    for (let k = 0; k < n; k++) {
      const i = (from + (same ? 1 : 0) + k) % n;
      if (catLabel(categories[i]).toLowerCase().startsWith(needle)) return i;
    }
    return -1;
  };

  // Keyboard model: WAI-ARIA APG "select-only combobox". Focus stays on the trigger the whole time.
  const onCatKey = (e) => {
    const { key } = e;
    const last = categories.length - 1;
    const printable = key.length === 1 && key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;

    if (!catOpen) {
      if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault();
        openCat();
      } else if (key === "Home" || key === "End") {
        e.preventDefault();
        openCat(key === "Home" ? 0 : last);
      } else if (printable) {
        e.preventDefault();
        const i = typeAhead(key, selectedIdx);
        openCat(i >= 0 ? i : selectedIdx);
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(last, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) pickCat(activeIdx);
        else setActiveIdx((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIdx(last);
        break;
      case "PageDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(last, i + 10));
        break;
      case "PageUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 10));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pickCat(activeIdx);
        break;
      case "Escape":
        e.preventDefault();
        closeCat(true);
        break;
      case "Tab":
        // No preventDefault: Tab must still move focus on.
        closeCat(false);
        break;
      default:
        if (printable) {
          e.preventDefault();
          const i = typeAhead(key, activeIdx);
          if (i >= 0) setActiveIdx(i);
        }
    }
  };

  // Clearing only the text box left the old search applied on /filter, so clear it there too.
  const handleClear = () => {
    setInput("");
    if (location.pathname === "/filter" && filters.search) {
      dispatch(updateFilter({ key: "search", value: "" }));
    }
    document.getElementById("sz-nav-q")?.focus();
  };

  const handleLogout = async () => {
    setAccountOpen(false);
    await dispatch(logout());
    navigate("/");
  };

  const wishCount = Array.isArray(wishList) ? wishList.length : 0;
  const cartCount = Array.isArray(cartItems)
    ? cartItems.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0)
    : 0;

  const firstName = user?.name ? user.name.trim().split(" ")[0] : "Account";
  const initial = (user?.name?.trim()?.[0] || user?.email?.[0] || "?").toUpperCase();

  // Active row-2 link: only on /filter, matched by the category id in the URL.
  const onFilter = location.pathname === "/filter";
  const activeCat = onFilter ? new URLSearchParams(location.search).get("category") : null;

  const badge = (n) => (n > 0 ? <span className="sz-nav__badge">{n > 99 ? "99+" : n}</span> : null);

  return (
    <header className={`sz-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container sz-nav__row">
        <button
          type="button"
          className="sz-nav__menu-btn"
          aria-label="Open menu"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <FiMenu />
        </button>

        {/* Logo goes home, not to /filter (BUG-74). */}
        <Link to="/" className="sz-nav__logo" aria-label="ShopZinc home">
          {/* <img src={logo} alt="ShopZinc" /> */}
          <span className="sz-nav__logo-mark" aria-hidden="true"><LuShoppingBag /></span>
          <span className="sz-nav__logo-text">ShopZinc</span>
        </Link>

        <form className="sz-nav__search" role="search" onSubmit={handleSearch}>
          {/* Native <select> replaced by a themed listbox; its popup could not be styled.
          <label className="sz-nav__sr" htmlFor="sz-nav-cat">Category</label>
          <div className="sz-nav__cat">
            <select
              id="sz-nav-cat"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <FiChevronDown className="sz-nav__cat-arrow" aria-hidden="true" />
          </div>
          */}
          <span className="sz-nav__sr" id="sz-nav-cat-label">Category</span>
          <div className="sz-nav__cat" ref={catRef}>
            <div
              id="sz-nav-cat"
              ref={catBtnRef}
              role="combobox"
              tabIndex={0}
              className="sz-nav__cat-btn"
              aria-labelledby="sz-nav-cat-label"
              aria-haspopup="listbox"
              aria-expanded={catOpen}
              aria-controls="sz-nav-cat-list"
              aria-activedescendant={catOpen ? `sz-nav-cat-opt-${activeIdx}` : undefined}
              title={catLabel(categories[selectedIdx])}
              onClick={() => (catOpen ? closeCat(false) : openCat())}
              onKeyDown={onCatKey}
            >
              {selectedCategory === ALL._id ? (
                <span className="sz-nav__cat-value">
                  <span className="sz-nav__cat-long">All categories</span>
                  {/* short form so the narrow mobile trigger does not cut "All categories" */}
                  <span className="sz-nav__cat-short">All</span>
                </span>
              ) : (
                <span className="sz-nav__cat-value">{catLabel(categories[selectedIdx])}</span>
              )}
              <FiChevronDown className={`sz-nav__cat-arrow ${catOpen ? "is-open" : ""}`} aria-hidden="true" />
            </div>

            {/* Always rendered so aria-controls points at a real element. mousedown is
                cancelled so a click never takes focus off the trigger. */}
            <ul
              id="sz-nav-cat-list"
              ref={catListRef}
              role="listbox"
              aria-labelledby="sz-nav-cat-label"
              tabIndex={-1}
              className="sz-nav__cat-list"
              hidden={!catOpen}
              onMouseDown={(e) => e.preventDefault()}
            >
              {categories.map((c, i) => {
                const selected = c._id === selectedCategory;
                return (
                  <li
                    key={c._id}
                    id={`sz-nav-cat-opt-${i}`}
                    role="option"
                    aria-selected={selected}
                    className={`sz-nav__cat-opt${i === activeIdx ? " is-active" : ""}${selected ? " is-selected" : ""}`}
                    onMouseMove={() => i !== activeIdx && setActiveIdx(i)}
                    onClick={() => pickCat(i)}
                  >
                    <span className="sz-nav__cat-opt-text">{catLabel(c)}</span>
                    {selected && <FiCheck className="sz-nav__cat-check" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="sz-nav__sr" htmlFor="sz-nav-q">Search products</label>
          <input
            id="sz-nav-q"
            type="text"
            placeholder="Search for products, brands and more"
            value={input}
            onInput={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          {input && (
            <button
              type="button"
              className="sz-nav__clear"
              aria-label="Clear search"
              // onClick={() => setInput("")}
              onClick={handleClear}
            >
              <FiX />
            </button>
          )}
          <button type="submit" className="sz-nav__search-btn" aria-label="Search">
            <FiSearch />
            <span>Search</span>
          </button>
        </form>

        {/* Guests can browse, so account links only show with a session. */}
        {user ? (
          <div className="sz-nav__actions">
            <Link to="/wishlist" className="sz-nav__icon sz-nav__icon--wish" aria-label={`Wishlist, ${wishCount} items`}>
              <FiHeart />
              {badge(wishCount)}
            </Link>
            <Link to="/cart" className="sz-nav__icon" aria-label={`Cart, ${cartCount} items`}>
              <FiShoppingCart />
              {badge(cartCount)}
            </Link>

            <div className="sz-nav__account" ref={accountRef}>
              <button
                type="button"
                ref={accountBtnRef}
                className="sz-nav__account-btn"
                aria-haspopup="true"
                aria-expanded={accountOpen}
                aria-controls="sz-nav-account-menu"
                onClick={() => setAccountOpen((o) => !o)}
              >
                <span className="sz-nav__avatar" aria-hidden="true">{initial}</span>
                <span className="sz-nav__account-name">{firstName}</span>
                <FiChevronDown className={`sz-nav__chev ${accountOpen ? "is-open" : ""}`} aria-hidden="true" />
              </button>

              {accountOpen && (
                <div className="sz-nav__menu" id="sz-nav-account-menu">
                  <div className="sz-nav__menu-head">
                    <span className="sz-nav__avatar sz-nav__avatar--lg" aria-hidden="true">{initial}</span>
                    <div className="sz-nav__menu-who">
                      <strong>{user.name || "My account"}</strong>
                      {user.email && <span>{user.email}</span>}
                    </div>
                  </div>
                  <ul>
                    <li><Link to="/profile"><FiUser /> Profile</Link></li>
                    <li><Link to="/orders"><FiPackage /> My orders</Link></li>
                    <li><Link to="/wishlist"><FiHeart /> Wishlist</Link></li>
                    {user.role === "admin" && (
                      <li><Link to="/admin"><FiShield /> Admin panel</Link></li>
                    )}
                  </ul>
                  <div className="sz-nav__menu-sep" role="separator" />
                  <ul>
                    <li>
                      <button type="button" className="sz-nav__logout" onClick={handleLogout}>
                        <FiLogOut /> Log out
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="sz-nav__actions">
            {/* `from` returns the visitor to this page after login. */}
            <Link to="/auth/login" state={{ from: location }} className="sz-nav__btn sz-nav__btn--outline">Log in</Link>
            <Link to="/auth/signup" state={{ from: location }} className="sz-nav__btn sz-nav__btn--primary">Sign up</Link>
          </div>
        )}
      </div>

      <nav className="sz-nav__cats" aria-label="Categories">
        <div className="container">
          <ul>
            <li>
              <Link
                to="/filter"
                // Bare /filter keeps the redux filters, so clear category + search or "All" would still show the old category.
                onClick={() => {
                  dispatch(updateFilter({ key: "category", value: ALL._id }));
                  dispatch(updateFilter({ key: "search", value: "" }));
                }}
                className={onFilter && !activeCat ? "is-active" : ""}
                aria-current={onFilter && !activeCat ? "page" : undefined}
              >
                All products
              </Link>
            </li>
            {dbCategories.slice(0, ROW2_LIMIT).map((c) => (
              <li key={c._id}>
                <Link
                  to={`/filter?category=${c._id}`}
                  className={activeCat === c._id ? "is-active" : ""}
                  aria-current={activeCat === c._id ? "page" : undefined}
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
