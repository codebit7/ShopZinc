import React from "react";
import placeholder from "./../../assets/Form/file/placeholder-image.jpg";
// Store currency is PKR; shared formatter replaces the hardcoded "$".
import { formatPrice } from "../../utils/currency";

const ProductCard = ({ images, name, price }) => {
  return (
    <div className="recommend-card">
      <img src={images?.[0]?.url || placeholder} alt={name} className="recommend-product-image" />
      <p className="p-price">{formatPrice(price)}</p>
      <p className="recommend-product-title">{name}</p>
    </div>
  );
};

export default ProductCard;
