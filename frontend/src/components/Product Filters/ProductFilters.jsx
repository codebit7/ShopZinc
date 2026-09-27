import React, { useEffect, useMemo, useRef, useState } from "react";
import "./productFilters.css";
import { FiChevronDown, FiSearch, FiSliders, FiStar, FiX } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { updateFilter, fetchCategories } from "../../Store/slices/productSlice";
import api from "../../api/client";
import { formatPrice } from "../../utils/currency";

// Full rewrite (redesign + facet counts). The previous version is backed up outside the repo
// (scratchpad/filters-backup/ProductFilters.jsx) instead of being kept here as a 260-line comment.

// Must match the values products are saved with, or the server never matches.
// Old labels ("Brand-new", "Old items") matched nothing in the database.
const CONDITIONS = ["Any", "New", "Refurbished", "Used"];

// Prices are PKR now; the old 10000 cap cut off most real products (phones, laptops).
const PRICE_MAX = 500000;
// Handles must stay at least Rs 1,000 apart: the old 100 gap was two tiny slivers on a 500,000 range.
const PRICE_GAP = 1000;
const PRICE_STEP = 500;

// One-click ranges: typing numbers on a phone is slow, and most shoppers think in bands.
const PRICE_CHIPS = [
  // Plain text, not formatPrice twice: "Rs 5,000 – Rs 25,000" is too long for a chip.
  { label: "Under Rs 5,000", range: [0, 5000] },
  { label: "Rs 5,000–25,000", range: [5000, 25000] },
  { label: "Rs 25,000–100,000", range: [25000, 100000] },
  { label: "Rs 100,000+", range: [100000, PRICE_MAX] },
];

// Values meaning "no filter" — same as FilterTags, so "Clear all" here and there do the same thing.
// `featured` (sort) is left alone on purpose: it is not a filter.
const DEFAULTS = { category: "All", priceRange: null, condition: "Any", rating: 0, search: "", brands: [] };

// Long lists show 5 items until "See all"; a picked item past the 5th stays visible so it can be un-picked.
const LIMIT = 5;
// Below this many brands a search box is just clutter.
const BRAND_SEARCH_MIN = 8;
// Must match the CSS breakpoint where the sidebar turns into a drawer.
const MOBILE_QUERY = "(max-width: 899px)";
const isObjectId = (v) => /^[a-f\d]{24}$/i.test(v);

// Same params FilterPage sends to /products (minus paging/sort), so the counts describe the same list.
const facetParams = (f) => {
  const p = {
    category: isObjectId(f.category) ? f.category : undefined,
    minPrice: f.priceRange?.[0],
    maxPrice: f.priceRange?.[1],
    condition: f.condition !== "Any" ? f.condition : undefined,
    minRating: f.rating || undefined,
    brand: f.brands.length ? f.brands.join(",") : undefined,
    search: f.search || undefined,
  };
  Object.keys(p).forEach((k) => p[k] === undefined && delete p[k]);
  return p;
};

// The endpoint is new; never let a half-shaped reply crash the sidebar.
const normalizeFacets = (d) => {
  if (!d || typeof d !== "object") return null;
  const arr = (a) => (Array.isArray(a) ? a : []);
  return {
    categories: arr(d.categories),
    brands: arr(d.brands),
    conditions: arr(d.conditions),
    ratings: arr(d.ratings),
    price: d.price && typeof d.price === "object" ? d.price : null,
    total: Number.isFinite(Number(d.total)) ? Number(d.total) : null,
  };
};

// Counts come from GET /products/facets. Debounced so dragging/typing does not fire a request per step;
// the request id drops a slow old reply that lands after a newer one. null = no counts (endpoint missing or failed).
const useFacets = (filters) => {
  const [facets, setFacets] = useState(null);
  const reqId = useRef(0);
  const params = facetParams(filters);
  const key = JSON.stringify(params);
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      api.get("/products/facets", { params })
        .then((res) => { if (id === reqId.current) setFacets(normalizeFacets(res.data)); })
        .catch(() => { if (id === reqId.current) setFacets(null); });
    }, 250);
    return () => clearTimeout(t);
  }, [key]);
  return facets;
};

const useIsMobile = () => {
  const get = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return mobile;
};

const Stars = ({ value }) => (
  <span className="pf-stars" aria-hidden="true">
    {[1, 2, 3, 4, 5].map((i) => (
      <FiStar key={i} className={i <= value ? "is-on" : ""} fill={i <= value ? "currentColor" : "none"} />
    ))}
  </span>
);

const Count = ({ n }) => (n === undefined ? null : <span className="pf-count">{n.toLocaleString()}</span>);

const Section = ({ id, title, open, onToggle, children }) => (
  <section className="pf-section">
    <h4 className="pf-section__title">
      <button type="button" className="pf-section__head" aria-expanded={open} aria-controls={`pf-sec-${id}`} onClick={onToggle}>
        <span>{title}</span>
        <FiChevronDown className={`pf-chevron ${open ? "is-open" : ""}`} aria-hidden="true" />
      </button>
    </h4>
    {open && <div className="pf-section__body" id={`pf-sec-${id}`}>{children}</div>}
  </section>
);

const ProductFilter = () => {
  const { filters, categories, totalProducts } = useSelector((state) => state.products);
  const dispatch = useDispatch();
  const set = (key, value) => dispatch(updateFilter({ key, value }));
  const facets = useFacets(filters);
  const isMobile = useIsMobile();

  const [openSections, setOpenSections] = useState({ category: true, brands: true, price: true, condition: true, rating: true });
  const toggleSection = (s) => setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));
  const [showAll, setShowAll] = useState({ category: false, brands: false });
  const toggleAll = (k) => setShowAll((prev) => ({ ...prev, [k]: !prev[k] }));

  // ---------- data sources: facets first, old sources as the fallback ----------
  const [apiBrands, setApiBrands] = useState([]);
  // Categories and brands come from the database, not hardcoded lists. Still fetched even with facets,
  // because facets only list what matches — this keeps the full list (zero-count items stay clickable).
  useEffect(() => {
    if (categories.length === 0) dispatch(fetchCategories());
    api.get("/brands")
      .then((res) => setApiBrands(Array.isArray(res.data) ? res.data : []))
      .catch((error) => console.error(error));
  }, [dispatch]);

  const catCount = useMemo(() => {
    if (!facets) return null;
    const m = {};
    facets.categories.forEach((c) => { if (c && c._id) m[String(c._id)] = Number(c.count) || 0; });
    return m;
  }, [facets]);
  const brandCount = useMemo(() => {
    if (!facets) return null;
    const m = {};
    facets.brands.forEach((b) => { if (b && b.name) m[b.name] = Number(b.count) || 0; });
    return m;
  }, [facets]);
  const condCount = useMemo(() => {
    if (!facets) return null;
    const m = {};
    facets.conditions.forEach((c) => { if (c && c.name) m[c.name] = Number(c.count) || 0; });
    // The condition facet ignores the condition filter, so its sum is "every condition" = the Any count.
    m.Any = facets.conditions.reduce((s, c) => s + (Number(c?.count) || 0), 0);
    return m;
  }, [facets]);
  const ratingCount = useMemo(() => {
    if (!facets) return null;
    const m = {};
    facets.ratings.forEach((r) => { if (r && r.min != null) m[Number(r.min)] = Number(r.count) || 0; });
    return m;
  }, [facets]);

  const baseCategories = categories.length ? categories : (facets?.categories || []).filter((c) => c && c._id);
  // "All" = everything matching the other filters = sum of the category facet (which ignores the category filter).
  const allCount = catCount ? Object.values(catCount).reduce((s, n) => s + n, 0) : undefined;
  const categoryItems = [{ _id: "All", name: "All" }, ...baseCategories];
  const visibleCategories = showAll.category ? categoryItems : categoryItems.filter((c, i) => i < LIMIT || filters.category === c._id);
  const countOfCategory = (c) => (c._id === "All" ? allCount : catCount ? (catCount[String(c._id)] ?? 0) : undefined);

  // Union keeps a brand visible when it has 0 matches, or when it came only from the URL.
  const allBrands = useMemo(() => {
    const names = new Set([...apiBrands, ...(facets?.brands || []).map((b) => b?.name), ...filters.brands].filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [apiBrands, facets, filters.brands]);
  const [brandQuery, setBrandQuery] = useState("");
  const q = brandQuery.trim().toLowerCase();
  const matchedBrands = q ? allBrands.filter((b) => b.toLowerCase().includes(q)) : allBrands;
  // While searching, show every match: hiding matches behind "See all" would look like "no result".
  const visibleBrands = q || showAll.brands ? matchedBrands : matchedBrands.filter((b, i) => i < LIMIT || filters.brands.includes(b));
  const countOfBrand = (b) => (brandCount ? (brandCount[b] ?? 0) : undefined);

  const toggleBrand = (brand, checked) =>
    set("brands", checked ? [...filters.brands, brand] : filters.brands.filter((b) => b !== brand));

  // ---------- price ----------
  // Inputs hold text so the user can empty a box while typing; blank means "no limit".
  const [minText, setMinText] = useState(filters.priceRange ? String(filters.priceRange[0]) : "");
  const [maxText, setMaxText] = useState(filters.priceRange ? String(filters.priceRange[1]) : "");
  // Keep the inputs in step when a chip's ×, "Clear all" or Back/Forward changes the filter.
  useEffect(() => {
    setMinText(filters.priceRange ? String(filters.priceRange[0]) : "");
    setMaxText(filters.priceRange ? String(filters.priceRange[1]) : "");
  }, [filters.priceRange]);
  const clamp = (n) => Math.min(PRICE_MAX, Math.max(0, n));
  const sliderMin = clamp(Number(minText) || 0);
  const sliderMax = maxText === "" ? PRICE_MAX : clamp(Number(maxText) || 0);
  const handleRangeChange = (type, value) => {
    if (type === "min") {
      if (value < sliderMax - PRICE_GAP) setMinText(String(value));
    } else if (value > sliderMin + PRICE_GAP) {
      setMaxText(String(value));
    }
  };
  const applyPrice = (e) => {
    e?.preventDefault();
    let min = Math.max(0, Math.floor(Number(minText) || 0));
    let max = maxText === "" ? PRICE_MAX : Math.max(0, Math.floor(Number(maxText) || 0));
    if (min > max) [min, max] = [max, min]; // typed backwards: swap instead of sending an empty range
    // Full range is the same as no filter; storing it would add a pointless chip and URL params.
    set("priceRange", min === 0 && max >= PRICE_MAX ? null : [min, max]);
  };
  const clearPrice = () => { setMinText(""); setMaxText(""); set("priceRange", null); };
  const isChip = (r) => !!filters.priceRange && filters.priceRange[0] === r[0] && filters.priceRange[1] === r[1];

  // ---------- active count / clear all ----------
  const activeCount =
    (filters.category !== "All" ? 1 : 0) + (filters.priceRange ? 1 : 0) + (filters.condition !== "Any" ? 1 : 0) +
    (filters.rating ? 1 : 0) + (filters.search ? 1 : 0) + filters.brands.length;
  const clearAll = () => Object.keys(DEFAULTS).forEach((k) => set(k, DEFAULTS[k]));
  const resultCount = facets?.total ?? totalProducts ?? 0;

  // ---------- mobile drawer ----------
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef(null);
  const toggleRef = useRef(null);
  const closeRef = useRef(null);
  const wasOpen = useRef(false);
  const drawer = isMobile && drawerOpen;
  // Growing past the breakpoint with the drawer open would leave the page scroll-locked.
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);
  useEffect(() => {
    if (drawer) {
      wasOpen.current = true;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden"; // the page behind should not scroll under the sheet
      const t = setTimeout(() => closeRef.current?.focus(), 30);
      return () => { clearTimeout(t); document.body.style.overflow = prev; };
    }
    // Hand focus back to the button that opened it, so keyboard users are not dropped at the top of the page.
    if (wasOpen.current) { wasOpen.current = false; toggleRef.current?.focus(); }
  }, [drawer]);
  const onPanelKeyDown = (e) => {
    if (!drawer) return;
    if (e.key === "Escape") { e.stopPropagation(); setDrawerOpen(false); return; }
    if (e.key !== "Tab" || !panelRef.current) return;
    // Loose focus trap: Tab wraps inside the sheet instead of walking into the hidden page.
    const els = [...panelRef.current.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])")]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="pf">
      <div className="pf-mobilebar">
        <button type="button" ref={toggleRef} className="pf-toggle" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawerOpen(true)}>
          <FiSliders aria-hidden="true" />
          <span>Filters</span>
          {activeCount > 0 && <span className="pf-badge" aria-label={`${activeCount} active`}>{activeCount}</span>}
        </button>
        {activeCount > 0 && (
          <button type="button" className="pf-link" onClick={clearAll}>Clear all</button>
        )}
      </div>

      {drawer && <div className="pf-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <aside
        ref={panelRef}
        className={`pf-panel ${drawer ? "is-open" : ""}`}
        role={isMobile ? "dialog" : undefined}
        aria-modal={drawer ? "true" : undefined}
        aria-label="Filters"
        onKeyDown={onPanelKeyDown}
      >
        <div className="pf-head">
          <h3>Filters</h3>
          <div className="pf-head__actions">
            {activeCount > 0 && <button type="button" className="pf-link" onClick={clearAll}>Clear all</button>}
            {isMobile && (
              <button type="button" ref={closeRef} className="pf-close" aria-label="Close filters" onClick={() => setDrawerOpen(false)}>
                <FiX aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="pf-body">
          <Section id="category" title="Category" open={openSections.category} onToggle={() => toggleSection("category")}>
            <ul className="pf-list">
              {/* The filter stores the category id: products come back with category populated, so names never matched (BUG-55). */}
              {visibleCategories.map((item) => {
                const n = countOfCategory(item);
                const active = filters.category === item._id;
                return (
                  <li key={item._id}>
                    <button
                      type="button"
                      className={`pf-cat ${active ? "is-active" : ""} ${n === 0 ? "is-empty" : ""}`}
                      aria-pressed={active}
                      onClick={() => set("category", item._id)}
                    >
                      <span className="pf-cat__name">{item.name}</span>
                      <Count n={n} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {categoryItems.length > LIMIT && (
              <button type="button" className="pf-more" onClick={() => toggleAll("category")}>
                {showAll.category ? "Show less" : `See all (${categoryItems.length})`}
              </button>
            )}
          </Section>

          <Section id="brands" title="Brands" open={openSections.brands} onToggle={() => toggleSection("brands")}>
            {allBrands.length > BRAND_SEARCH_MIN && (
              <label className="pf-search">
                <FiSearch aria-hidden="true" />
                <input type="search" placeholder="Search brands" aria-label="Search brands" value={brandQuery} onInput={(e) => setBrandQuery(e.target.value)} />
              </label>
            )}
            <ul className="pf-list">
              {visibleBrands.map((brand) => {
                const n = countOfBrand(brand);
                return (
                  <li key={brand}>
                    <label className={`pf-check ${n === 0 ? "is-empty" : ""}`}>
                      <input type="checkbox" checked={filters.brands.includes(brand)} onChange={(e) => toggleBrand(brand, e.target.checked)} />
                      <span className="pf-check__box" aria-hidden="true" />
                      <span className="pf-check__label">{brand}</span>
                      <Count n={n} />
                    </label>
                  </li>
                );
              })}
            </ul>
            {q && matchedBrands.length === 0 && <p className="pf-empty">No brands match “{brandQuery.trim()}”.</p>}
            {!q && allBrands.length > LIMIT && (
              <button type="button" className="pf-more" onClick={() => toggleAll("brands")}>
                {showAll.brands ? "Show less" : `See all (${allBrands.length})`}
              </button>
            )}
          </Section>

          <Section id="price" title="Price" open={openSections.price} onToggle={() => toggleSection("price")}>
            <div className="pf-chips">
              {PRICE_CHIPS.map((c) => {
                const on = isChip(c.range);
                return (
                  <button key={c.label} type="button" className={`pf-chip ${on ? "is-active" : ""}`} aria-pressed={on}
                    // Picking the active band again clears it, like the rating rows.
                    onClick={() => set("priceRange", on ? null : c.range)}>
                    {c.label}
                  </button>
                );
              })}
            </div>
            {/* Dual slider kept: it still fits the 264px card, and a drag is handy for rough ranges. */}
            <div className="pf-range">
              <div className="pf-range__track" />
              <div className="pf-range__fill" style={{ left: `${(sliderMin / PRICE_MAX) * 100}%`, width: `${((sliderMax - sliderMin) / PRICE_MAX) * 100}%` }} />
              <input type="range" min="0" max={PRICE_MAX} step={PRICE_STEP} value={sliderMin} aria-label="Minimum price"
                onInput={(e) => handleRangeChange("min", Number(e.target.value))} />
              <input type="range" min="0" max={PRICE_MAX} step={PRICE_STEP} value={sliderMax} aria-label="Maximum price"
                onInput={(e) => handleRangeChange("max", Number(e.target.value))} />
            </div>
            {/* A form so Enter in either box applies, like every other search box on the web. */}
            <form className="pf-price" onSubmit={applyPrice}>
              <div className="pf-price__inputs">
                <label className="pf-money">
                  <span>Rs</span>
                  <input type="number" inputMode="numeric" min="0" placeholder="Min" aria-label="Minimum price in rupees"
                    value={minText} onInput={(e) => setMinText(e.target.value)} />
                </label>
                <span className="pf-dash" aria-hidden="true">–</span>
                <label className="pf-money">
                  <span>Rs</span>
                  <input type="number" inputMode="numeric" min="0" placeholder="Max" aria-label="Maximum price in rupees"
                    value={maxText} onInput={(e) => setMaxText(e.target.value)} />
                </label>
              </div>
              {facets?.price && Number.isFinite(Number(facets.price.min)) && Number.isFinite(Number(facets.price.max)) && (
                <p className="pf-hint">Results range {formatPrice(facets.price.min)} – {formatPrice(facets.price.max)}</p>
              )}
              <div className="pf-price__actions">
                {filters.priceRange && <button type="button" className="pf-btn pf-btn--ghost" onClick={clearPrice}>Clear</button>}
                <button type="submit" className="pf-btn pf-btn--primary">Apply</button>
              </div>
            </form>
          </Section>

          <Section id="condition" title="Condition" open={openSections.condition} onToggle={() => toggleSection("condition")}>
            <div className="pf-seg" role="radiogroup" aria-label="Condition">
              {CONDITIONS.map((c) => {
                const n = condCount ? (condCount[c] ?? 0) : undefined;
                const on = filters.condition === c;
                return (
                  <label key={c} className={`pf-seg__item ${on ? "is-active" : ""} ${n === 0 && !on ? "is-empty" : ""}`}
                    title={n === undefined ? c : `${c}: ${n.toLocaleString()} products`}>
                    {/* key was 'conditon' (typo), so this filter never applied (BUG-58) */}
                    <input type="radio" name="pf-condition" value={c} checked={on} onChange={() => set("condition", c)} />
                    <span>{c}</span>
                    {n !== undefined && <small>{n.toLocaleString()}</small>}
                  </label>
                );
              })}
            </div>
          </Section>

          <Section id="rating" title="Rating" open={openSections.rating} onToggle={() => toggleSection("rating")}>
            <div className="pf-ratings" role="radiogroup" aria-label="Minimum rating">
              {[5, 4, 3, 2, 1].map((stars) => {
                const n = ratingCount ? (ratingCount[stars] ?? 0) : undefined;
                const on = filters.rating === stars;
                return (
                  <label key={stars} className={`pf-rate ${on ? "is-active" : ""} ${n === 0 && !on ? "is-empty" : ""}`}>
                    <input
                      type="radio"
                      name="pf-rating"
                      value={stars}
                      checked={on}
                      aria-label={stars < 5 ? `${stars} stars and up` : "5 stars"}
                      onChange={() => set("rating", stars)}
                      // Click again to clear (a checked radio fires no change event, so it is caught here).
                      onClick={() => { if (on) set("rating", 0); }}
                    />
                    <Stars value={stars} />
                    <span className="pf-rate__label">{stars < 5 ? "& up" : ""}</span>
                    <Count n={n} />
                  </label>
                );
              })}
            </div>
          </Section>
        </div>

        {isMobile && (
          <div className="pf-foot">
            <button type="button" className="pf-btn pf-btn--primary pf-btn--block" onClick={() => setDrawerOpen(false)}>
              Show {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default ProductFilter;
