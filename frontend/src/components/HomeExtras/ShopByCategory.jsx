import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import "./homeExtras.css";

// Every category as a compact row (round thumbnail + name + product count), so shoppers can jump
// straight to one without the menu. Cover images are the ones the admin sets in Home sections;
// counts come from /products/facets, which counts the whole catalog.
const ShopByCategory = () => {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.get("/category"), api.get("/products/facets")])
      .then(([catRes, facetRes]) => {
        if (!alive) return;
        // getAllCategories returns a bare array; facets gives { categories: [{ _id, count }] }.
        const all = Array.isArray(catRes.data) ? catRes.data : [];
        const counts = new Map((facetRes.data?.categories || []).map((c) => [String(c._id), c.count]));
        // An empty category leads to an empty page, so it is left out.
        setCategories(all
          .map((c) => ({ ...c, count: counts.get(String(c._id)) || 0 }))
          .filter((c) => c.count > 0));
      })
      .catch((error) => console.error(error));
    return () => { alive = false; };
  }, []);

  // One row is not a choice; hide the section until there is something to pick from.
  if (categories.length < 2) return null;

  return (
    <section className="hx-section container">
      <div className="hx-head">
        <h2>Shop by category</h2>
        <Link to="/filter" className="hx-link">All products</Link>
      </div>
      <div className="hx-cats">
        {categories.map((c) => (
          <Link to={`/filter?category=${c._id}`} className="hx-cat" key={c._id}>
            <span className="hx-cat-thumb">
              {c.coverImage?.url
                ? <img src={c.coverImage.url} alt="" loading="lazy" />
                : <span className="hx-cat-letter" aria-hidden="true">{c.name?.charAt(0)}</span>}
            </span>
            <span className="hx-cat-text">
              <span className="hx-cat-name" title={c.name}>{c.name}</span>
              <span className="hx-cat-count">{c.count} {c.count === 1 ? "product" : "products"}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default ShopByCategory;
