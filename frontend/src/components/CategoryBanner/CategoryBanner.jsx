import { useEffect, useState } from "react";
import './catStyles.css';
import hero_image from './../../assets/Brand/hero_image.jpg';
import profile from './../../assets/Form/file/profile.png';
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../../Store/slices/authSlice";
import { updateFilter } from "../../Store/slices/productSlice";
import api from "../../api/client";

// Hardcoded list replaced by real categories from GET /category.
/* const categories = [
  "Automobiles",
  "Clothes and wear",
  "Home interiors",
  "Computer and tech",
  "Tools, equipments",
  "Sports and outdoor",
  "Animal and pets",
  "Machinery tools",
  "More category",
]; */

const CategoryBanner = () => {
  // const [activeCategory, setActiveCategory] = useState("Automobiles");
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState(null);
  const user = useSelector((state) => state.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.get("/category")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCategories(list);
        // Start on the first home-page category (it has a cover the admin chose), else the first one.
        setActive(list.find((c) => c.showOnHome) || list[0] || null);
      })
      .catch((error) => console.error(error));
  }, []);

  return (
    <div className="category-banner-container container">
      
     
      <div className="category-sidebar">
        {categories.map((category) => (
          <div
            key={category._id}
            className={`category-item ${
              active?._id === category._id ? "active-category" : ""
            }`}
            onClick={() => setActive(category)}
          >
            {category.name}
          </div>
        ))}
      </div>

      
      <div className="banner">
        <div className="banner-text">
          {/* Hero follows the clicked category; the old text and image stay as the fallback. */}
          <p className="trending-text">{active?.description || "Latest trending"}</p>
          <h2 className="electronic-text">{active?.name || "Electronic items"}</h2>
          {/* Opens the filter page on the clicked category; BUG-55 is fixed, the filter works by id. */}
          <button className="learn-btn" onClick={() => { if (active) dispatch(updateFilter({ key: "category", value: active._id })); navigate("/filter"); }}>Learn more</button>
        </div>
        <img src={active?.coverImage?.url || hero_image} alt={active?.name || "Electronics"} className="banner-image" />
      </div>

      
      <div className="my-user-box">
        <div className="user-card">
          <div className="userBox">
            <img src={profile} alt="User" className="user-image" />
            {/* Guests can browse now, so this card must work with no user */}
            <p className="user-text">
              {user ? <>Hi, {user.name}</> : <>Hi, there <br /> let's get started</>}
            </p>
          </div>
          {user ? (
            <button className="login-btn" onClick={() => dispatch(logout())}>Log out</button>
          ) : (
            <>
              {/* `from` returns the visitor to this page after login (it survives the signup tab too). */}
              <button className="join-btn" onClick={() => navigate('/auth/signup', { state: { from: location } })}>Join now</button>
              <button className="login-btn" onClick={() => navigate('/auth/login', { state: { from: location } })}>Log in</button>
            </>
          )}
        </div>
        {/* Store currency is PKR; promo text said "US $10". */}
        <div className="offer-card ">Get Rs 2,500 off<br /> with a new <br /> supplier</div>
        <div className="quote-card ">Send quotes with <br />supplier <br /> preferences</div>
      </div>
    </div>
  );
};

export default CategoryBanner;
