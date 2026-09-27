// One place for store facts shown in the footer and the help/legal pages.
// Empty strings are hidden on the site, so nothing made-up is ever shown.
// EDIT BEFORE LAUNCH: fill in contact + social, and confirm the policy numbers below.
export const SITE = {
  name: "ShopZinc",
  tagline: "Everyday products, fair prices, delivered across Pakistan.",
  country: "Pakistan",

  contact: {
    email: "",   // e.g. support@yourdomain.com
    phone: "",   // e.g. +92 3xx xxxxxxx
    whatsapp: "",
    address: "", // street + city
    hours: "",   // e.g. Mon–Sat, 10am–6pm
  },

  social: {
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    x: "",
  },

  // Policy defaults used by the Shipping and Returns pages — confirm these with the business.
  policy: {
    deliveryDays: "3–5 working days",
    returnDays: 7,
    refundDays: "5–7 working days",
  },

  // Keep in sync with the backend's available payment methods (backend/src/config/payments.js).
  payments: ["Cash on Delivery", "JazzCash", "Easypaisa"],
};
