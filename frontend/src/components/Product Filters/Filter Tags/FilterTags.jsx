import React from "react";
import "./filterTags.css";
// Feather only, to match the filter sidebar (CgClose / IoMdClose were two different icon sets).
import { FiX } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { updateFilter } from "../../../Store/slices/productSlice";
import { formatPrice } from "../../../utils/currency";

// Values meaning "no filter", used for each chip's × and for "Clear all".
const DEFAULTS = { category: "All", priceRange: null, condition: "Any", rating: 0, search: "", brands: [] };

const FilterTags = () => {
  const {filters, categories} = useSelector((state)=>state.products);
  const dispatch = useDispatch();
  const reset = (key) => dispatch(updateFilter({ key, value: DEFAULTS[key] }));

  // One chip per active filter (it only showed brands, so other filters were invisible once set).
  const tags = [];
  if (filters.category !== "All") tags.push({ key: "category", label: categories.find((c) => c._id === filters.category)?.name || "Category", onRemove: () => reset("category") });
  if (filters.search) tags.push({ key: "search", label: `"${filters.search}"`, onRemove: () => reset("search") });
  // Store currency is PKR; chip uses the shared formatter instead of "$".
  // if (filters.priceRange) tags.push({ key: "priceRange", label: `$${filters.priceRange[0]} - $${filters.priceRange[1]}` });
  if (filters.priceRange) tags.push({ key: "priceRange", label: `${formatPrice(filters.priceRange[0])} - ${formatPrice(filters.priceRange[1])}`, onRemove: () => reset("priceRange") });
  if (filters.condition !== "Any") tags.push({ key: "condition", label: filters.condition, onRemove: () => reset("condition") });
  if (filters.rating) tags.push({ key: "rating", label: `${filters.rating}★ & up`, onRemove: () => reset("rating") });
  // Keyed by brand name, not index: removing one chip must not reuse another chip's DOM (and its focus).
  filters.brands.forEach((brand) => tags.push({
    key: `brand-${brand}`,
    label: brand,
    onRemove: () => dispatch(updateFilter({ key: 'brands', value: filters.brands.filter((item) => item !== brand) })),
  }));

  if (tags.length === 0) return null;

  // The whole chip is one <button>: the old <span onClick> × could not be reached with Tab or Enter.
  return (
    <div className="filter-tags">
      {tags.map((t) => (
        <button key={t.key} type="button" className="filter-tag" onClick={t.onRemove} aria-label={`Remove filter: ${t.label}`}>
          <span>{t.label}</span>
          <FiX className="filter-tag__x" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="clear-all" onClick={() => Object.keys(DEFAULTS).forEach(reset)}>
        Clear all
      </button>
    </div>
  );

  /* Previous version: chips were <div>s with a <span onClick> ×, not keyboard reachable.
  return (
    <div className="filter-tags">
      {tags.map((t) => (
        <div key={t.key} className="filter-tag">
          <span>{t.label}</span>
          <span onClick={() => reset(t.key)} aria-label={`Remove ${t.label}`}><CgClose/></span>
        </div>
      ))}
      {filters.brands.map((filter, index) => (
        <div key={index} className="filter-tag">
            <span>{filter}</span>
            <span onClick={()=>dispatch(updateFilter({key:'brands',value: filters.brands.filter(item=> item !==filter)}))}><CgClose/></span>
        </div>
      ))}
      <button className="clear-all" onClick={() => Object.keys(DEFAULTS).forEach(reset)}>
        Clear all filter
      </button>
    </div>
  ); */

  /* Old version: brands only, and "Clear all" only cleared brands.
  return (
    <div className="filter-tags">
      {filters.brands.map((filter, index) => (
        <div key={index} className="filter-tag">
            <span>{filter}</span>
            <span onClick={()=>dispatch(updateFilter({key:'brands',value: filters.brands.filter(item=> item !==filter)}))}><CgClose/></span>
        </div>
      ))}
      {filters.brands.length > 0 && (
        <button className="clear-all" onClick={()=>dispatch(updateFilter({key:'brands',value:[]}))}>
          Clear all filter
        </button>
      )}
    </div>
  ); */
};

export default FilterTags;
