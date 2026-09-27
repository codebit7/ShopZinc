import React, { useEffect, useState } from "react";
import api from "../../api/client";
import ProductCard from "../ProductCard/ProductCard";
import { readRecent, clearRecent } from "../../utils/recentlyViewed";
import "../RecommendedItems/recommendedItems.css";
import "./homeExtras.css";

const SHOW = 4; // one row on desktop

// Products this visitor opened before. Only ids are stored, and each product is fetched again,
// so the price and stock shown are current and deleted products just drop out.
const RecentlyViewed = () => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let alive = true;
    const ids = readRecent().slice(0, SHOW);
    if (ids.length === 0) return;
    Promise.allSettled(ids.map((id) => api.get(`/product/${id}`)))
      .then((results) => {
        if (!alive) return;
        setProducts(results
          .filter((r) => r.status === "fulfilled" && r.value.data?.data)
          .map((r) => r.value.data.data));
      });
    return () => { alive = false; };
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="hx-section container">
      <div className="hx-head">
        <h2>Recently viewed</h2>
        <button type="button" className="hx-link" onClick={() => { clearRecent(); setProducts([]); }}>
          Clear
        </button>
      </div>
      <div className="recommend-product-grid">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
};

export default RecentlyViewed;
