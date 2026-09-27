import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import ProductCard from "../ProductCard/ProductCard";
// Reuses the Recommended grid so both rows line up the same.
import "../RecommendedItems/recommendedItems.css";
import "./homeExtras.css";

// The newest products, so returning visitors see what changed since last time.
const NewArrivals = () => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let alive = true;
    api.get("/products", { params: { sort: "newest", limit: 8, page: 1 } })
      .then((res) => { if (alive) setProducts(res.data.data || []); })
      .catch((error) => console.error(error));
    return () => { alive = false; };
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="hx-section container">
      <div className="hx-head">
        <h2>New arrivals</h2>
        <Link to="/filter?sort=newest" className="hx-link">See all</Link>
      </div>
      <div className="recommend-product-grid">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
};

export default NewArrivals;
