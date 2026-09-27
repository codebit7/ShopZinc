import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// One place for browser tab titles; before this every tab just said "Shopzinc".
const STORE = {
  "/": "Shopzinc",
  "/filter": "Products | Shopzinc",
  "/cart": "Cart | Shopzinc",
  "/checkout": "Checkout | Shopzinc",
  "/wishlist": "Wishlist | Shopzinc",
  "/orders": "Orders | Shopzinc",
  "/profile": "Profile | Shopzinc",
  "/contact": "Contact us | Shopzinc",
  "/shipping": "Shipping & delivery | Shopzinc",
  "/returns": "Returns & refunds | Shopzinc",
  "/terms": "Terms & conditions | Shopzinc",
  "/privacy": "Privacy policy | Shopzinc",
  "/auth": "Log in | Shopzinc",
  "/auth/login": "Log in | Shopzinc",
  "/auth/signup": "Sign up | Shopzinc",
  "/auth/forgot-password": "Forgot password | Shopzinc",
};

const ADMIN = {
  "/admin": "Dashboard",
  "/admin/dashboard": "Dashboard",
  "/admin/view": "Products",
  "/admin/create": "Add Product",
  "/admin/categories": "Categories",
  "/admin/orders": "Orders",
  "/admin/payments": "Payments",
  "/admin/courier": "Courier",
  "/admin/inventory": "Inventory",
  "/admin/customers": "Customers",
  "/admin/home-sections": "Home sections",
};

export const titleFor = (pathname) => {
  // The router matches "/cart/" as "/cart", so the title must too.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (STORE[path]) return STORE[path];
  // Generic; ProductDetailsPage swaps in the real name once the product loads.
  if (/^\/product\/[^/]+$/.test(path)) return "Product | Shopzinc";
  // The token is in the URL, so this one cannot be a STORE key.
  if (/^\/auth\/reset-password\/[^/]+$/.test(path)) return "Reset password | Shopzinc";
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (ADMIN[path]) return `${ADMIN[path]} | Shopzinc Admin`;
    if (/^\/admin\/create\/[^/]+$/.test(path)) return "Edit Product | Shopzinc Admin";
    return "Page not found | Shopzinc Admin";
  }
  return "Page not found | Shopzinc";
};

// Runs only on pathname change, so a page that sets its own title later (product page) keeps it.
const PageTitle = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);
  return null;
};

export default PageTitle;
