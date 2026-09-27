import React, { useState } from "react";
import { FaTh, FaBars } from "react-icons/fa";
import "./filterBar.css";
import { useDispatch, useSelector } from "react-redux";
import { updateFilter } from "../../Store/slices/productSlice";

const FilterBar = ({setLayoutToggle}) => {
  const [isVerifiedOnly, setIsVerifiedOnly] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const {filters, totalProducts, categories } = useSelector((state)=>state.products);
  // filters.category holds an id now; show its name.
  const categoryName = categories.find((c) => c._id === filters.category)?.name || "All categories";
  const dispatch = useDispatch();

  return (
    <div className="filter-bar">
     
      <span className="item-count">
        {totalProducts.toLocaleString()} items in <strong>{categoryName}</strong>
      </span>

      <div className="filter-options">
        
       
        {/* "Verified only" hidden: no product or supplier has a verified field, so it could never filter anything. */}
        {/* <div className="verified-checkbox">
          <input
            id="verified-only-checkbox"
            type="checkbox"
            checked={isVerifiedOnly}
            onChange={(e) => setIsVerifiedOnly(e.target.checked)}
          />

        <label className="verified-only" htmlFor="verified-only-checkbox">
        Verified only
        </label>
        </div> */}
         
        

        
        <select
          className="sort-dropdown"
          value={filters.featured}
          onChange={(e) => dispatch(updateFilter({key: 'featured',value: e.target.value}))}
        >
          <option value="Featured">Featured</option>
          <option value="Newest">Newest</option>
          <option value="Price: Low to High">Low to High</option>
          <option value="Price: High to Low">High to Low</option>
          {/* Value must match SORT_TO_SLUG in FilterPage.jsx, or it is sent as no sort. */}
          <option value="Biggest discount">Biggest discount</option>
        </select>

        
        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
            onClick={() =>{
              setViewMode("grid")
              setLayoutToggle(true);
             
            } }
          >
            <FaTh />
          </button>
          <button
            className={`view-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() =>{
              setViewMode("list")
              setLayoutToggle(false);
            }}
          >
            <FaBars />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
