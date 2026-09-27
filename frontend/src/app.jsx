import { useState, useEffect } from "preact/hooks";
import { useDispatch } from "react-redux";
import { Routes, Route, Navigate } from "react-router-dom";
import "./app.css";
import { fetchMe, logout } from "./Store/slices/authSlice";
import { setAuthFailureHandler } from "./api/client";
import SidebarMenu from "./components/Side Bar/SideBarMenu";
import AuthenticationPage from "./Pages/AuthenticationPage";
import HomeLayout from "./Pages/HomeLayout";
import HomePage from "./Pages/HomePage";
import FilterPage from "./Pages/FilterPage";
import ProductDetailsPage from "./Pages/ProductDetailsPage";
import CartPage from "./Pages/CartPage";
import CheckoutPage from "./Pages/CheckoutPage";
import Login from "./components/Auth/Login";
import SignUp from "./components/Auth/SignUp";
import ForgotPassword from "./components/Auth/ForgotPassword";
import ResetPassword from "./components/Auth/ResetPassword";
import Protect from "./components/Auth/Protect";
import AdminLayout from "./Admin/Pages/AdminLayout";
import ViewProducts from "./Admin/Components/ViewProducts";
import CreateProduct from "./Admin/Components/CreateProduct";
import ProductView from "./Admin/Components/ProductView";
import Categories from "./Admin/Components/Categories";
import Dashboard from "./Admin/Components/Dashboard";
import Orders from "./Admin/Components/Orders";
import Payments from "./Admin/Components/Payments";
import Courier from "./Admin/Components/Courier";
import Inventory from "./Admin/Components/Inventory";
import Customers from "./Admin/Components/Customers";
import HomeSections from "./Admin/Components/HomeSections";
import WishListPage from "./Pages/WishListPage";
import ProfilePage from "./Pages/ProfilePage";
import AccountLayout from "./Pages/Account/AccountLayout";
import AddressesPage from "./Pages/Account/AddressesPage";
import OrdersPage from "./Pages/Account/OrdersPage";
import OrderDetailsPage from "./Pages/Account/OrderDetailsPage";
import NotFoundPage from "./Pages/NotFoundPage";
import ContactPage from "./Pages/Info/ContactPage";
import ShippingPage from "./Pages/Info/ShippingPage";
import ReturnsPage from "./Pages/Info/ReturnsPage";
import TermsPage from "./Pages/Info/TermsPage";
import PrivacyPage from "./Pages/Info/PrivacyPage";
import AdminNotFound from "./Admin/Components/AdminNotFound";
import AdminProfile from "./Admin/Components/AdminProfile";
import AdminSettings from "./Admin/Components/AdminSettings";
import AdminReports from "./Admin/Components/AdminReports";
import CarouselManager from "./Admin/Components/CarouselManager";
import OrderReceipt from "./Admin/Components/OrderReceipt";
import ScrollToTop from "./components/ScrollToTop";
import PageTitle from "./components/PageTitle";

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    // httpOnly cookies are unreadable from JS, so ask the server who we are.
    dispatch(fetchMe());
    // When a refresh attempt fails, drop the session; <Protect/> then routes.
    setAuthFailureHandler(() => dispatch(logout()));
  }, [dispatch]);


  return (
    <>
      <ScrollToTop />
      <PageTitle />
      <Routes>
       
        <Route path="/auth" element={<AuthenticationPage />}>
          <Route index element={<Navigate to="/auth/login" />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password/:token" element={<ResetPassword />} />
        </Route>

       
        {/* Client rule: guests may browse products; login only for personal pages. */}
        <Route path="/" element={<HomeLayout setMenuOpen={setMenuOpen} />}>
          <Route index element={<HomePage />} />
          <Route path="filter" element={<FilterPage />} />
          <Route path="product/:id" element={<ProductDetailsPage />} />
          <Route element={<Protect requiredRole="user" />}>
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="wishlist" element={<WishListPage />} />
            {/* <Route path="orders" element={<div>Orders</div>} /> */}
            {/* <Route path="profile" element={<div>Profile</div>} /> */}
            {/* <Route path="profile" element={<ProfilePage />} /> */}
            {/* Account pages share one layout (left nav) so they link to each other. */}
            <Route element={<AccountLayout />}>
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/addresses" element={<AddressesPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderId" element={<OrderDetailsPage />} />
            </Route>
          </Route>
          {/* Help + legal pages stay public: guests must read these before buying or signing up. */}
          <Route path="contact" element={<ContactPage />} />
          <Route path="shipping" element={<ShippingPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          {/* Catch-all lives here so unknown URLs keep the navbar and footer. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        
        <Route element={<Protect requiredRole="admin" />}>
          {/* Outside AdminLayout on purpose: a receipt prints as a clean page, no sidebar or top bar. */}
          <Route path="/admin/receipt/:orderId" element={<OrderReceipt />} />
          <Route path="/admin" element={<AdminLayout />}>
            {/* Admins now land on the dashboard; it was /admin/view before the dashboard existed. */}
            {/* <Route index element={<Navigate to="/admin/view" />} /> */}
            <Route index element={<Navigate to="/admin/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="view" element={<ViewProducts />} />
            {/* Target of the eye button in ViewProducts. */}
            <Route path="products/:id" element={<ProductView />} />
            <Route path="create/:id" element={<CreateProduct />} />
            <Route path="create" element={<CreateProduct />} />
            <Route path="categories" element={<Categories />} />
            <Route path="orders" element={<Orders />} />
            <Route path="payments" element={<Payments />} />
            {/* PostEx booking, shipments and delivery-fee settings in one page. */}
            <Route path="courier" element={<Courier />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="customers" element={<Customers />} />
            <Route path="home-sections" element={<HomeSections />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="carousel" element={<CarouselManager />} />
            {/* Unknown /admin/... paths stay inside the admin chrome instead of a blank page. */}
            <Route path="*" element={<AdminNotFound />} />
          </Route>
        </Route>

      
        {/* Was <Navigate to="/unauthorized" />, but that route does not exist, so it
            matched "*" again and looped forever. Render inline instead of redirecting. */}
        {/* Replaced by <NotFoundPage/> under the "/" layout above, so the 404 keeps the navbar/footer. */}
        {/* <Route path="*" element={<div style={{ padding: "4rem", textAlign: "center" }}>404 — page not found</div>} /> */}
      </Routes>

      
      {menuOpen && <SidebarMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}
    </>
  );
}

export default App;
