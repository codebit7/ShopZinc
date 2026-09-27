import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Outlet } from "react-router-dom";
import { getWishlistItem } from "../Store/slices/wishList";
import { getCartItems } from "../Store/slices/cartSlice";
import NavBar from "../components/Header/NavBar";
// TopNav removed on request; the file is kept in case it comes back.
// import TopNav from "../components/Header/TopNav";
import Footer from "../components/Footer/Footer";

const HomeLayout = ({ setMenuOpen }) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  // load the wishlist so product-card hearts show the server state on every storefront page.
  // Guests can browse now, so skip it without a user (it would only 401); re-runs after login.
  useEffect(() => {
    if (user) dispatch(getWishlistItem());
  }, [dispatch, user]);

  // load the cart once per login so the navbar cart badge is right on every page.
  // No cart yet = 404 from the API; the slice only stores it in cart.error, which no screen shows, so it reads as empty.
  useEffect(() => {
    if (user) dispatch(getCartItems());
  }, [dispatch, user]);

  return (
    <>
      <NavBar setMenuOpen={setMenuOpen} />
      {/* <TopNav /> */}
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
};

export default HomeLayout;
