import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import "./homeExtras.css";

// Some shoppers look for a brand, not a category. Each chip opens the list filtered to that brand.
const MAX_BRANDS = 24; // more than this turns the row into a wall of text

const ShopByBrand = () => {
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    let alive = true;
    // Returns a sorted array of brand names (products with no brand are left out).
    api.get("/brands")
      .then((res) => { if (alive) setBrands(Array.isArray(res.data) ? res.data : []); })
      .catch((error) => console.error(error));
    return () => { alive = false; };
  }, []);

  if (brands.length === 0) return null;

  return (
    <section className="hx-section container">
      <div className="hx-head">
        <h2>Shop by brand</h2>
      </div>
      <div className="hx-brands">
        {brands.slice(0, MAX_BRANDS).map((b) => (
          // encodeURIComponent: brand names can hold "&" or spaces.
          <Link to={`/filter?brand=${encodeURIComponent(b)}`} className="hx-brand" key={b}>{b}</Link>
        ))}
      </div>
    </section>
  );
};

export default ShopByBrand;
