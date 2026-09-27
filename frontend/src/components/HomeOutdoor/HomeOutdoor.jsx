import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./homeOutdoor.css";
import api from "../../api/client";
import { useDispatch } from "react-redux";
import { updateFilter } from "../../Store/slices/productSlice";
import placeholder from "../../assets/Form/file/placeholder-image.jpg";
// Store currency is PKR; shared formatter replaces the hardcoded "USD".
import { formatPrice } from "../../utils/currency";

// One reusable home section per category: the admin picks which categories show on home,
// so products and cover come from the API instead of hardcoded arrays in HomePage.
const HomeOutdoor = ({ category }) => {
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    const f = category.homeFilters || {};
    const params = {
      category: category._id,
      minPrice: f.minPrice,
      maxPrice: f.maxPrice,
      minDiscount: f.minDiscount,
      sort: f.sort,
      limit: f.limit || 8,
      page: 1,
    };
    // Drop empty params so the backend doesn't filter on "" or null.
    Object.keys(params).forEach((k) => {
      if (params[k] === undefined || params[k] === null || params[k] === "") delete params[k];
    });
    api.get("/products", { params })
      .then((res) => setProducts(res.data.data || []))
      .catch((error) => console.error(error));
  // Filters in the deps: otherwise a new filter set with the same category id kept the old products.
  }, [category._id, JSON.stringify(category.homeFilters)]);

  // An empty section on the home page looks broken, so hide it.
  if (products.length === 0) return null;

  return (
    <div className="home-outdoor-container container">

      <div className="home-outdoor-info">
        <img src={category.coverImage?.url || placeholder} alt=""  className="info-image" />
        <div className="content">

          <h2 className="home-outdoor-title">{category.name}</h2>
          {/* Opens the filter page already on this category (the filter works by id now). */}
          <button className="source-btn" onClick={() => { dispatch(updateFilter({ key: "category", value: category._id })); navigate("/filter"); }}>Source now →</button>
        </div>
      </div>


      <div className="home-outdoor-items">
        {products.map((product) => (
          <Link to={`/product/${product._id}`} className="home-outdoor-item" key={product._id}>
            <img src={product.images?.[0]?.url || placeholder} alt={product.name} />
            {/* Was {info.title}: every tile showed the section title instead of the product */}
            <p>{product.name}</p>
            <span className="product-price">From {formatPrice(product.price)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default HomeOutdoor;
