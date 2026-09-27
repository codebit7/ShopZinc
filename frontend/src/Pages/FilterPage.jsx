import React, { useEffect, useRef, useState } from "react";
import ProductFilter from "./../components/Product Filters/ProductFilters";
import Path from "./../components/Path/Path";
import FilterBar from "./../components/Filter Bar/FilterBar"; 
import FilterTags from "./../components/Product Filters/Filter Tags/FilterTags"; 
import './pagesStyle.css'


import  img1 from './../assets/Image/tech/1.png'
import  img2 from './../assets/Image/tech/2.png'
import  img3 from './../assets/Image/tech/3.png'
import  img4 from './../assets/Image/tech/4.png'
import  img5 from './../assets/Image/tech/5.png'

import  img6 from './..//assets/Image/tech/6.png'
import ProductList from "./../components/ProductList/ProductList";
import ProductGrid from './../components/ProductGrid/ProductGrid'
import Pagination from './../components/Pagination/Pagination'
import JoinUs from "../components/JoinUs/JoinUs";
import NavBar from "../components/Header/NavBar";
// import TopNav from "../components/Header/TopNav";
import Footer from "../components/Footer/Footer";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts, updateFilter } from "../Store/slices/productSlice";
import { useLocation, useNavigate } from "react-router-dom";

// --- url-sync helpers (pure; copied by the scratch self-check) ---
// Filters live in the URL too, so refresh, shared links and Back/Forward keep them.
// Must match the slice's initial filters: a missing URL key means "this default".
const FILTER_DEFAULTS = { category: "All", priceRange: null, rating: 0, search: "", condition: "Any", brands: [], featured: "Featured" };
const URL_CONDITIONS = ["New", "Refurbished", "Used"];
// const SORT_TO_SLUG = { Newest: "newest", "Price: Low to High": "price_asc", "Price: High to Low": "price_desc" };
// const SLUG_TO_SORT = { newest: "Newest", price_asc: "Price: Low to High", price_desc: "Price: High to Low" };
// discount_desc added: the backend supports it and carousel links use /filter?sort=discount_desc;
// without it that URL param was dropped and the page fell back to "Featured".
const SORT_TO_SLUG = { Newest: "newest", "Price: Low to High": "price_asc", "Price: High to Low": "price_desc", "Biggest discount": "discount_desc" };
const SLUG_TO_SORT = { newest: "Newest", price_asc: "Price: Low to High", price_desc: "Price: High to Low", discount_desc: "Biggest discount" };

// Fixed key order + defaults omitted, so the same filters always give the same string (loop guard).
const filtersToQuery = (f) => {
  const p = new URLSearchParams();
  if (/^[a-f\d]{24}$/i.test(f.category)) p.set("category", f.category);
  if (f.search) p.set("q", f.search);
  if (f.priceRange) { p.set("min", String(f.priceRange[0])); p.set("max", String(f.priceRange[1])); }
  if (URL_CONDITIONS.includes(f.condition)) p.set("condition", f.condition);
  if (f.rating) p.set("rating", String(f.rating));
  if (f.brands && f.brands.length) p.set("brand", f.brands.join(","));
  if (SORT_TO_SLUG[f.featured]) p.set("sort", SORT_TO_SLUG[f.featured]);
  // Keep commas readable in the brand list.
  return p.toString().replace(/%2C/gi, ",");
};

// Bad or hand-edited values fall back to defaults instead of reaching the API.
const queryToFilters = (search) => {
  const p = new URLSearchParams(search);
  const f = { ...FILTER_DEFAULTS, brands: [] };
  const cat = p.get("category");
  if (cat && /^[a-f\d]{24}$/i.test(cat)) f.category = cat;
  // f.search = p.get("q") || "";
  // Trimmed: "?q=%20%20" searched for spaces and showed a blank chip instead of all products.
  f.search = (p.get("q") || "").trim();
  if (p.has("min") && p.has("max")) {
    const min = Number(p.get("min")), max = Number(p.get("max"));
    if (p.get("min") !== "" && p.get("max") !== "" && isFinite(min) && isFinite(max) && min >= 0 && min <= max) f.priceRange = [min, max];
  }
  if (URL_CONDITIONS.includes(p.get("condition"))) f.condition = p.get("condition");
  const r = Number(p.get("rating"));
  if (Number.isInteger(r) && r >= 1 && r <= 5) f.rating = r;
  const brand = p.get("brand");
  if (brand) f.brands = [...new Set(brand.split(",").map((b) => b.trim()).filter(Boolean))];
  if (SLUG_TO_SORT[p.get("sort")]) f.featured = SLUG_TO_SORT[p.get("sort")];
  return f;
};

// Same filters => same string, whatever order/encoding the URL came in with.
const canonicalQuery = (search) => filtersToQuery(queryToFilters(search));
// --- end url-sync helpers ---




// const products = [
//   {
//     id: 1,
//     image: img1,
//     title: "Samsung Galaxy S23 Ultra - 512GB",
//     price: 999.99,
//     oldPrice: 1299.0,
//     rating: 4.9,
//     reviews: 320,
//     orders: 600,
//     description:
//       "Samsung's most advanced smartphone with S-Pen support and incredible camera.",
//     freeShipping: true,
//     category: "Smartphones",
//     condition: "Brand-new",
//     publishDate: "2024-03-10",
//     brand: "Samsung",
//   },
//   {
//     id: 2,
//     image: img2,
//     title: "iPhone 14 Pro Max - 256GB",
//     price: 899.99,
//     oldPrice: 1199.0,
//     rating: 4.8,
//     reviews: 290,
//     orders: 550,
//     description:
//       "Experience Apple's best smartphone with ProMotion display and enhanced camera.",
//     freeShipping: true,
//     category: "Smartphones",
//     condition: "Brand-new",
//     publishDate: "2024-02-15",
//     brand: "Apple",
//   },
//   {
//     id: 3,
//     image: img3,
//     title: "Huawei FreeBuds Pro 2",
//     price: 199.99,
//     oldPrice: 249.0,
//     rating: 4.7,
//     reviews: 180,
//     orders: 320,
//     description:
//       "Premium wireless earbuds with noise cancellation and superior sound quality.",
//     freeShipping: true,
//     category: "Mobile accessory",
//     condition: "Any",
//     publishDate: "2024-01-20",
//     brand: "Huawei",
//   },
//   {
//     id: 4,
//     image: img4,
//     title: "Poco X4 Pro 5G - 256GB",
//     price: 349.99,
//     oldPrice: 399.0,
//     rating: 4.6,
//     reviews: 180,
//     orders: 300,
//     description:
//       "A powerful mid-range smartphone with a 120Hz display and 108MP camera.",
//     freeShipping: true,
//     category: "Smartphones",
//     condition: "Refurbished",
//     publishDate: "2023-12-10",
//     brand: "Poco",
//   },
//   {
//     id: 5,
//     image: img5,
//     title: "Lenovo Legion 5 Pro - Gaming Laptop",
//     price: 999.99,
//     oldPrice: 1299.0,
//     rating: 4.8,
//     reviews: 250,
//     orders: 450,
//     description:
//       "A high-performance gaming laptop with RTX graphics and a 165Hz display.",
//     freeShipping: true,
//     category: "Electronics",
//     condition: "Old items",
//     publishDate: "2024-03-01",
//     brand: "Lenovo",
//   },
//   {
//     id: 6,
//     image: img6,
//     title: "Samsung Smartwatch Galaxy Watch 5",
//     price: 299.99,
//     oldPrice: 349.0,
//     rating: 4.7,
//     reviews: 220,
//     orders: 400,
//     description:
//       "A premium smartwatch with fitness tracking, ECG, and long battery life.",
//     freeShipping: true,
//     category: "Modern tech",
//     condition: "Brand-new",
//     publishDate: "2024-02-25",
//     brand: "Samsung",
//   },
// ];



const FilterPage = () => {


   
   const [layoutToggle, setLayoutToggle] = useState(false);

   const dispatch = useDispatch();
   const { products, totalPage, filters, productsLoading } = useSelector((state) => state.products);

   // const [pagenationSetting, setPaginationSetting] = useState({
   //    limit:10,
   //    page:1
   // });
   // forKey = the filters this page number was picked for. Any other filters mean page 1, worked out
   // in the same render, so a filter change sends ONE request (with page 1), not old page + page 1.
   const [paging, setPaging] = useState({ page: 1, limit: 10, forKey: null });
   // Client-side filtering over one page is gone (BUG-55/56/57): the server filters the whole catalog.
   /* const [filteredProduct,setFilteredProduct] = useState(products);

   useEffect(() => {
    const applyFilters = () => {
    
      const filtered = products.filter((product) => 
        (filters.category !=="All" ? product.category === filters.category : true) &&
        (filters.priceRange ? product.price >= filters.priceRange[0] && product.price <= filters.priceRange[1] : true) &&
        (filters.condition !== "Any" ? product.condition === filters.condition : true) &&
        (filters.rating ? product.rating >= filters.rating : true) &&
        (filters.brands.length > 0 ? filters.brands.includes(product.brand) : true)
      );
  
      
      setFilteredProduct(filtered);
    };

    applyFilters();
  }, [filters,products]); */
  const filteredProduct = products;

  const location = useLocation();
  const navigate = useNavigate();
  // The query string we last wrote/read, so our own URL write is not read back as a new filter change.
  const urlQueryRef = useRef(null);
  // Hold the first fetch until the URL is applied, or a shared link would fetch with old redux filters first.
  const [urlReady, setUrlReady] = useState(false);

  // filterSync marks entries this page wrote; a bare /filter without it came from another component.
  const writeUrl = (q, replace) => {
    urlQueryRef.current = q;
    navigate({ search: q ? `?${q}` : "" }, { replace, state: { filterSync: true } });
  };

  // URL -> redux (arrival, refresh, shared link, Back/Forward).
  useEffect(() => {
    const raw = location.search.replace(/^\?/, "");
    // NavBar search / "Source now" set redux, then navigate to bare /filter: redux wins. Replace, so landing adds no history entry.
    if (!raw && !location.state?.filterSync) {
      writeUrl(filtersToQuery(filters), true);
      setUrlReady(true);
      return;
    }
    // Our own write coming back (or no real change): nothing to apply.
    if (urlQueryRef.current !== null && canonicalQuery(raw) === canonicalQuery(urlQueryRef.current)) return;
    const next = queryToFilters(raw);
    Object.keys(next).forEach((key) => {
      if (JSON.stringify(next[key]) !== JSON.stringify(filters[key])) dispatch(updateFilter({ key, value: next[key] }));
    });
    urlQueryRef.current = raw;
    // Bad values were dropped: clean the address bar without a new history entry.
    if (canonicalQuery(raw) !== raw) writeUrl(canonicalQuery(raw), true);
    setUrlReady(true);
  }, [location.search, location.key]);

  // redux -> URL. Push, so Back steps through filter changes. Must stay after the effect above (it updates the ref first).
  useEffect(() => {
    if (!urlReady) return;
    const q = filtersToQuery(filters);
    if (q !== urlQueryRef.current) writeUrl(q, false);
  }, [filters, urlReady]);

  /* useEffect(()=>{
    if (!urlReady) return; // see urlReady above

    const sortMap = { Newest: "newest", "Price: Low to High": "price_asc", "Price: High to Low": "price_desc" };
    const params = {
      ...pagenationSetting,
      // navbar search still stores a category *name*; only a real id is sent.
      category: /^[a-f\d]{24}$/i.test(filters.category) ? filters.category : undefined,
      minPrice: filters.priceRange?.[0],
      maxPrice: filters.priceRange?.[1],
      condition: filters.condition !== "Any" ? filters.condition : undefined,
      minRating: filters.rating || undefined,
      brand: filters.brands.length ? filters.brands.join(",") : undefined,
      search: filters.search || undefined,
      sort: sortMap[filters.featured],
    };
    Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
    dispatch(fetchProducts(params));
  },[filters,pagenationSetting,dispatch,urlReady]) */

  const filterParams = {
    // Only a real 24-hex id is sent; "All" (or any stray non-id value) means no category filter.
    category: /^[a-f\d]{24}$/i.test(filters.category) ? filters.category : undefined,
    minPrice: filters.priceRange?.[0],
    maxPrice: filters.priceRange?.[1],
    condition: filters.condition !== "Any" ? filters.condition : undefined,
    minRating: filters.rating || undefined,
    brand: filters.brands.length ? filters.brands.join(",") : undefined,
    search: filters.search?.trim() || undefined,
    sort: SORT_TO_SLUG[filters.featured],
  };
  Object.keys(filterParams).forEach((k) => filterParams[k] === undefined && delete filterParams[k]);
  const filtersKey = JSON.stringify(filterParams);
  const page = paging.forKey === filtersKey ? paging.page : 1;
  // One serialized key for the whole request: the effect below runs only when it really changes.
  const queryKey = JSON.stringify({ page, limit: paging.limit, ...filterParams });

  // Pin the stored page to the new filters, so going back to old filters later does not restore
  // an old page 2. Same values as the derived ones above, so it causes no extra fetch.
  useEffect(() => {
    setPaging((prev) => (prev.forKey === filtersKey ? prev : { ...prev, page: 1, forKey: filtersKey }));
  }, [filtersKey]);

  // The key we last asked for: until its reply lands, the list shows a skeleton, not stale results.
  const requestedKeyRef = useRef(null);
  useEffect(() => {
    if (!urlReady) return; // see urlReady above
    requestedKeyRef.current = queryKey;
    dispatch(fetchProducts(JSON.parse(queryKey)));
  }, [queryKey, urlReady, dispatch]);

  const listLoading = !urlReady || productsLoading || requestedKeyRef.current !== queryKey;

  const handlePageChange = ({ page: nextPage, limit }) => setPaging({ page: nextPage, limit, forKey: filtersKey });

  // Empty-state "Clear filters": back to defaults for everything except the sort order.
  const clearFilters = () => {
    ["category", "priceRange", "condition", "rating", "brands", "search"].forEach((key) => {
      if (JSON.stringify(filters[key]) !== JSON.stringify(FILTER_DEFAULTS[key])) {
        dispatch(updateFilter({ key, value: Array.isArray(FILTER_DEFAULTS[key]) ? [] : FILTER_DEFAULTS[key] }));
      }
    });
  };

  return (
    <>

   
    <Path />
    <div className="container">
      
      <div className="product-container">
        <ProductFilter />
        <div className="products-section">
      
          <FilterBar setLayoutToggle={setLayoutToggle}/>
          <FilterTags />

          <div className="products-container">
          {
            
            layoutToggle ? 
                 <ProductGrid products={filteredProduct} loading={listLoading} onClear={clearFilters}/>
                         :<ProductList products={filteredProduct} loading={listLoading} onClear={clearFilters}/>
          }
          </div>
          
          {/* key: a filter change remounts it, so it goes back to page 1 instead of an empty page 3 */}
          {/* <Pagination 
            key={JSON.stringify(filters)}
            initialLimit={pagenationSetting.limit}
            totalPages={totalPage}
            setSetting = {setPaginationSetting}
          /> */}
          {/* Controlled: FilterPage owns page/limit (see paging above). Hidden when a finished search found nothing. */}
          {!(!listLoading && filteredProduct.length === 0) && (
            <Pagination
              page={page}
              limit={paging.limit}
              totalPages={totalPage}
              onChange={handlePageChange}
            />
          )}

        </div>
      </div>

    </div>
    <JoinUs/>
    
    </>
  );
};

export default FilterPage;
