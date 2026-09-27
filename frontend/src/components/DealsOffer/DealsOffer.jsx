import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
// Only used by the old hardcoded `products` list below.
// import pic1 from './../../assets/Image/tech/5.png'
// import pic2 from './../../assets/Image/tech/6.png'
// import pic3 from './../../assets/Image/tech/7.png'
// import pic4 from './../../assets/Image/tech/8.png'
// import pic5 from './../../assets/Image/tech/3.png'
import demoImage  from './../../assets/Form/file/placeholder-image.jpg'

import "./dealsOffer.css";
import api from "../../api/client";

// const products = [
//   { id: 1, name: "Smart watches", img: pic4, discount: "-25%" },
//   { id: 2, name: "Laptops", img: pic3, discount: "-15%" },
//   { id: 3, name: "GoPro cameras", img: pic2, discount: "-40%" },
//   { id: 4, name: "Headphones", img: pic1, discount: "-25%" },
//   { id: 5, name: "Canon cameras", img: pic5, discount: "-25%" },
// ];

// Deals run weekly: count down to next Sunday 23:59:59 local. Recomputed every tick,
// so once Sunday ends it rolls over to the next week by itself.
const timeLeft = () => {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  end.setHours(23, 59, 59, 999);
  const s = Math.max(0, Math.floor((end - now) / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return [
    [pad(Math.floor(s / 86400)), "Days"],
    [pad(Math.floor(s / 3600) % 24), "Hour"],
    [pad(Math.floor(s / 60) % 60), "Min"],
    [pad(s % 60), "Sec"],
  ];
};

const DealsOffer = () => {

  const [dealsProducts, setDealsProducts] = useState([]);
  const [countdown, setCountdown] = useState(timeLeft);

  // Timer is hidden (see below), so no need to re-render every second.
  // useEffect(() => {
  //   const id = setInterval(() => setCountdown(timeLeft()), 1000);
  //   return () => clearInterval(id);
  // }, []);

  useEffect(() => {
    // Public endpoint; no token needed at all.
    api.get('/productDeals', { params: { minDiscount: 10, limit: 5 } })
      .then((res) => setDealsProducts(res.data.data || []))
      .catch((error) => console.error(error));
  }, []);
  return (
    <div className="deals-offers-container container">

      <div className="deals-info">
        <div className="info-content">
        <h3 className="deals-title">Deals and offers</h3>
        {/* <p className="deals-subtitle">Hygiene equipments</p> */}
        {/* Why: leftover demo text — deals are from every category (BUG-66). */}
        <p className="deals-subtitle">Our biggest discounts right now</p>
        </div>
        {/* Hidden: deals have no end date, so a "ends in" timer was fake (BUG-66).
            Bring it back once deals get a real end date. */}
        {/* <div className="countdown">
          {countdown.map(([value, label]) => (
            <div key={label} className="time-box">
              <span>{value}</span>
              <small>{label}</small>
            </div>
          ))}
        </div> */}
      </div>


      <div className="deals-items">
        {dealsProducts.map((product) => (
          // Inline style: tile is now an anchor, which is underlined by default.
          <Link to={`/product/${product._id}`} key={product._id} className="deal-item" style={{ textDecoration: "none" }}>
            <img src={product.images?.[0]?.url || demoImage} alt={product.name} />
            <p>{product.name}</p>
            {/* discount is a percent here, matching productDeals' `discount > 10` (see BUG-62) */}
            {/* Rounded: a Rs discount saved as a percent can be 33.33; the badge shows 33. */}
            <div className="deals-discount">-{Math.round(product.discount)}%</div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DealsOffer;
