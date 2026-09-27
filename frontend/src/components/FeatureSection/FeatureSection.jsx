import React from "react";
import "./featureSection.css";
import { FaLock, FaCommentDots, FaTruck } from "react-icons/fa"; 
import { SITE } from "../../config/site";

// const features = [
//   { id: 1, icon: <FaLock />, title: "Secure payment", text: "Have you ever finally just" },
//   { id: 2, icon: <FaCommentDots />, title: "Customer support", text: "Have you ever finally just" },
//   { id: 3, icon: <FaTruck />, title: "Free delivery", text: "Have you ever finally just" },
// ];
// Why: placeholder text, and "Free delivery" was never a real promise (BUG-66).
// Facts come from config/site.js, the same source as the Shipping and Returns pages.
const features = [
  { id: 1, icon: <FaLock />, title: "Cash on delivery", text: "Pay when your order arrives" },
  { id: 2, icon: <FaTruck />, title: "Delivery across " + SITE.country, text: SITE.policy.deliveryDays },
  { id: 3, icon: <FaCommentDots />, title: "Easy returns", text: `${SITE.policy.returnDays}-day returns` },
];

const FeatureSection = () => {
  return (
    <div className="feature-section container">
      {features.map((feature) => (
        <div key={feature.id} className="feature-item">
          <div className="icon">{feature.icon}</div>
          <div className="feature-content">
            <p className="feature-title">{feature.title}</p>
            <p className="feature-text">{feature.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FeatureSection;
