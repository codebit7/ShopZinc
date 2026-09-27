// useCallback only served the commented-out onPage wrapper below.
import React, { /* useCallback, */ useEffect, useState } from "react";
// Buttons are the shared .adm-btn now; bootstrap Button/CSS no longer needed on this page.
// import { Button } from "react-bootstrap";
// import "bootstrap/dist/css/bootstrap.min.css";
import {
  FaEye, FaEdit, FaTrash, FaStar, FaPlus, FaSearch,
  FaCheckCircle, FaExclamationTriangle, FaTimesCircle, FaFilter,
} from "react-icons/fa";
import "./../Styles/viewProducts.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts, fetchCategories } from "../../Store/slices/productSlice";
// Store currency is PKR; shared formatter replaces the hardcoded "$".
import { formatPrice } from "../../utils/currency";
// BUG-78: calculateRating() was called with no product, so it always showed 0. Use averageRating instead.
// import { calculateRating } from "../../components/ProductList/ProductList";
// Placeholder only when a product has no image (BUG-78: it used to show for every product).
import camera from './../../assets/Image/tech/1.png'
import api from "../../api/client";
import Pagination from "../../components/Pagination/Pagination";

const LOW_STOCK = 5;

// Admin list had search only. These keys match GET /products query params, so filtering runs
// on the server over the whole catalog, not just the loaded page (BUG-57).
// const EMPTY_FILTERS = { category: "", condition: "", featured: false, minPrice: "", maxPrice: "", sort: "" };
// "Featured only" removed on request; keep it out of here too, or it still counts on the Filters button.
const EMPTY_FILTERS = { category: "", condition: "", minPrice: "", maxPrice: "", sort: "" };

// Colour is never the only signal: every stock badge has an icon + word.
// Exported so the product detail page shows the exact same badge.
export const StockBadge = ({ stock }) => {
  const n = Number(stock) || 0;
  if (n <= 0) return <span className="adm-badge critical"><FaTimesCircle aria-hidden="true" /> Out of stock</span>;
  if (n <= LOW_STOCK) return <span className="adm-badge warning"><FaExclamationTriangle aria-hidden="true" /> Low · {n}</span>;
  return <span className="adm-badge good"><FaCheckCircle aria-hidden="true" /> In stock · {n}</span>;
};

const ViewProducts = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { products, categories, loading, totalPage, totalProducts } = useSelector((state) => state.products);
  // Was always page 1 / limit 10: any product past the 10th (e.g. a newly created one) never showed,
  // so the admin could not edit or delete it. Pagination drives page + limit now.
  const [setting, setSetting] = useState({ page: 1, limit: 10 });
  // Old note: "Client-side only: filters the page already loaded. The API has no name search yet (see BUG-57)."
  // GET /products now takes `search` (name + brand, case-insensitive) over the whole catalog, so the
  // search goes to the server. It lives in ?q= so the top-bar search and a refresh land on the same results.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get("q") || "";
  const [search, setSearch] = useState(urlQ);
  // Debounced, trimmed text actually sent to the server — one request per pause, not per key.
  const [query, setQuery] = useState(urlQ.trim());

  // The top-bar search navigates here with a new ?q= while this page is already mounted.
  useEffect(() => {
    setSearch(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const q = search.trim();
    if (q === query) return;
    const t = setTimeout(() => {
      setQuery(q);
      // A new search starts at page 1; page 3 of the old results may not exist any more.
      setSetting((s) => (s.page === 1 ? s : { ...s, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search, query]);

  const onSearchInput = (value) => {
    setSearch(value);
    // replace, not push: every keystroke would otherwise be its own Back-button step.
    setSearchParams(value ? { q: value } : {}, { replace: true });
  };

  // Pagination calls this on mount and on every remount; skipping identical values avoids a second,
  // duplicate fetch each time the search changes.
  // Why commented out: Pagination calls setSetting with a FUNCTION (prev => ...), not {page, limit}.
  // This wrapper read page/limit off that function -> undefined, so every click stayed on page 1.
  // Pagination already skips identical values itself, so plain setSetting is enough.
  // const onPage = useCallback(({ page, limit }) => {
  //   setSetting((s) => (s.page === page && s.limit === limit ? s : { page, limit }));
  // }, []);

  // What the admin is typing/picking vs. what was last sent: price boxes would otherwise fire a
  // request on every key, same as search.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);

  useEffect(() => {
    if (filters === applied) return;
    const t = setTimeout(() => {
      setApplied(filters);
      // Same as search: page 3 of the old results may not exist under the new filter.
      setSetting((s) => (s.page === 1 ? s : { ...s, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [filters, applied]);

  const onFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  // const hasFilters = Object.keys(EMPTY_FILTERS).some((k) => applied[k] !== EMPTY_FILTERS[k]);
  // Count shows on the Filters button, so the admin can see filters are on even with the row closed.
  const activeCount = Object.keys(EMPTY_FILTERS).filter((k) => applied[k] !== EMPTY_FILTERS[k]).length;
  const hasFilters = activeCount > 0;
  const [showFilters, setShowFilters] = useState(false);
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // Empty values become undefined so axios leaves them out of the query string.
  const listParams = {
    ...setting,
    search: query || undefined,
    category: applied.category || undefined,
    condition: applied.condition || undefined,
    // featured: applied.featured ? "true" : undefined,
    minPrice: applied.minPrice || undefined,
    maxPrice: applied.maxPrice || undefined,
    sort: applied.sort || undefined,
  };

  // The category dropdown needs the list; skip if another page already loaded it.
  useEffect(() => {
    if (!categories?.length) dispatch(fetchCategories());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    // dispatch(fetchProducts({ ...setting, search: query || undefined }));
    dispatch(fetchProducts(listParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, setting, query, applied]);

  const handleEdit = (id) => {
    navigate(`/admin/create/${id}`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await api.delete(`/delete/${id}`);
      // Keep the search and filters, or a delete would silently drop back to the unfiltered list.
      // dispatch(fetchProducts({ ...setting, search: query || undefined }));
      dispatch(fetchProducts(listParams));
    } catch (error) {
      alert(error.response?.data?.message || "Error deleting product");
    }
  };

  // Filtering the loaded page here missed matches on other pages; the server does it now.
  // const q = search.trim().toLowerCase();
  // const shown = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q)) : products;
  const q = query;
  const shown = products;

  return (
    <div className="vp">
      <div className="adm-page-head">
        <div>
          <h2>Products</h2>
          {/* With a search on, totalProducts is the match count, not the catalog size. */}
          {/* <p>{totalProducts ?? products.length} products in your catalog</p> */}
          {/* <p>{q ? "Search results" : `${totalProducts ?? products.length} products in your catalog`}</p> */}
          <p>{q || hasFilters ? "Search results" : `${totalProducts ?? products.length} products in your catalog`}</p>
        </div>
        <button type="button" className="adm-btn primary" onClick={() => navigate("/admin/create")}>
          <FaPlus aria-hidden="true" /> Add Product
        </button>
      </div>

      <div className="adm-card">
        <div className="adm-toolbar">
          <label className="adm-search">
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              className="adm-input"
              placeholder="Search by name or brand"
              aria-label="Search products"
              value={search}
              onInput={(e) => onSearchInput(e.target.value)}
            />
          </label>
          {/* All filters in one row crowded the toolbar; they now open from one Filters button. */}
          <button type="button" className={`adm-btn secondary vp-filter-btn${showFilters ? " open" : ""}`}
            aria-expanded={showFilters} aria-controls="vp-filters" onClick={() => setShowFilters((v) => !v)}>
            <FaFilter aria-hidden="true" /> Filters
            {activeCount > 0 && <span className="vp-filter-count">{activeCount}</span>}
          </button>
          {/* {q && <span className="adm-muted">{shown.length} of {products.length} on this page</span>} */}
          {/* {q && !loading && <span className="adm-muted">{totalProducts ?? 0} matching products</span>} */}
          {(q || hasFilters) && !loading && <span className="adm-muted">{totalProducts ?? 0} matching products</span>}
        </div>

        {showFilters && (
        <div className="adm-toolbar vp-filters" id="vp-filters">
          <select className="adm-select" aria-label="Filter by category" value={filters.category} onChange={(e) => onFilter("category", e.target.value)}>
            <option value="">All categories</option>
            {(categories || []).map((cat) => (
              <option key={cat._id} value={cat._id}>{cat.name}</option>
            ))}
          </select>
          {/* Same three values CreateProduct allows. */}
          <select className="adm-select" aria-label="Filter by condition" value={filters.condition} onChange={(e) => onFilter("condition", e.target.value)}>
            <option value="">Any condition</option>
            <option value="New">New</option>
            <option value="Refurbished">Refurbished</option>
            <option value="Used">Used</option>
          </select>
          <input type="number" min="0" className="adm-input vp-price" placeholder="Min price" aria-label="Minimum price"
            value={filters.minPrice} onInput={(e) => onFilter("minPrice", e.target.value)} />
          <input type="number" min="0" className="adm-input vp-price" placeholder="Max price" aria-label="Maximum price"
            value={filters.maxPrice} onInput={(e) => onFilter("maxPrice", e.target.value)} />
          {/* Keys match the server's sortMap in getProducts. */}
          <select className="adm-select" aria-label="Sort products" value={filters.sort} onChange={(e) => onFilter("sort", e.target.value)}>
            <option value="">Default order</option>
            <option value="newest">Newest first</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="discount_desc">Biggest discount</option>
          </select>
          {/* Removed on request. */}
          {/* <label className="vp-check">
            <input type="checkbox" checked={filters.featured} onChange={(e) => onFilter("featured", e.target.checked)} />
            Featured only
          </label> */}
          {hasFilters && (
            <button type="button" className="adm-btn ghost sm" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        )}

        {/* Wide table scrolls inside its card, never the whole page. */}
        <div className="adm-table-wrap">
          <table className="adm-table vp-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Price</th>
                <th>Stock</th>
                <th>Category</th>
                <th className="num">Rating</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="adm-empty">Loading...</div></td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6}><div className="adm-empty">{q || hasFilters ? "No products match your search." : "No products yet."}</div></td></tr>
              ) : (
                shown.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <div className="vp-product">
                        <span className="vp-thumb">
                          <img src={product.images?.[0]?.url || camera} alt="" />
                        </span>
                        <span className="vp-name" title={product.name}>{product.name}</span>
                      </div>
                    </td>
                    <td className="num">{formatPrice(product.price)}</td>
                    <td><StockBadge stock={product.stock} /></td>
                    <td className="adm-muted">{product.category?.name ?? '—'}</td>
                    <td className="num">
                      <span className="vp-rating"><FaStar aria-hidden="true" /> {Number(product.averageRating ?? 0).toFixed(1)}</span>
                    </td>
                    <td className="actions">
                      {/* View had no handler; it now opens the admin product detail page. */}
                      {/* <button type="button" className="adm-btn ghost sm icon" aria-label="View"> */}
                      <button type="button" className="adm-btn ghost sm icon" aria-label="View" onClick={() => navigate(`/admin/products/${product._id}`)}>
                        <FaEye />
                      </button>
                      <button type="button" className="adm-btn ghost sm icon" aria-label="Edit" onClick={() => handleEdit(product._id)}>
                        <FaEdit />
                      </button>
                      <button type="button" className="adm-btn danger sm icon" aria-label="Delete" onClick={() => handleDelete(product._id)}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="vp-footer">
          {/* key: remount on a new search so Pagination's own page state goes back to 1 too. */}
          {/* <Pagination totalPages={totalPage} setSetting={setSetting} /> */}
          {/* <Pagination key={query} totalPages={totalPage} setSetting={onPage} initialLimit={setting.limit} /> */}
          {/* <Pagination key={query} totalPages={totalPage} setSetting={setSetting} initialLimit={setting.limit} /> */}
          {/* Filters in the key too, so a filter change also resets Pagination's own page to 1. */}
          <Pagination key={query + JSON.stringify(applied)} totalPages={totalPage} setSetting={setSetting} initialLimit={setting.limit} />
        </div>
      </div>
    </div>
  );
};

export default ViewProducts;
