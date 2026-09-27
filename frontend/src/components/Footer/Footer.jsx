import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  LuShoppingBag, LuBanknote, LuShieldCheck, LuUndo2, LuTruck,
  LuMail, LuPhone, LuMapPin, LuClock, LuCreditCard, LuWallet,
} from "react-icons/lu";
import { FaFacebookF, FaInstagram, FaTiktok, FaYoutube, FaXTwitter } from "react-icons/fa6";
import { fetchCategories } from "../../Store/slices/productSlice";
import { SITE } from "../../config/site";
import "./footer.css";
// Old footer showed a placeholder "Brand" image, fake About/Partnership columns and two copies of
// the same app-store image; none of it was real, so those imports are gone.
// import appStore from './../../assets/Misc/market-button.png'
// import logo from './../../assets/Brand/logo-colored.png'
// FooterBar only held a fake "© 2023 Ecommerce." + a US-flag "English" picker that did nothing.
// The real copyright + socials now live in the bottom bar below.
// import FooterBar from "./FooterBar";

// Same cap as a short column; more than this turns the footer into a wall of links.
const CATEGORY_LIMIT = 6;

const SOCIALS = [
  { key: "facebook", label: "Facebook", Icon: FaFacebookF },
  { key: "instagram", label: "Instagram", Icon: FaInstagram },
  { key: "tiktok", label: "TikTok", Icon: FaTiktok },
  { key: "youtube", label: "YouTube", Icon: FaYoutube },
  { key: "x", label: "X (Twitter)", Icon: FaXTwitter },
];

// Neutral text pills with a generic icon: we do not draw fake brand logos.
const paymentIcon = (name) => {
  // "cash on" not just "cash": JazzCash is a mobile wallet, not cash.
  if (/cash on|^cod$/i.test(name)) return LuBanknote;
  if (/card/i.test(name)) return LuCreditCard;
  return LuWallet;
};

const LinkColumn = ({ id, title, links }) => (
  <nav className="sz-footer__col" aria-labelledby={id}>
    <h2 id={id} className="sz-footer__heading">{title}</h2>
    <ul className="sz-footer__links">
      {links.map((l) => (
        <li key={l.to}>
          <Link to={l.to} state={l.state}>{l.label}</Link>
        </li>
      ))}
    </ul>
  </nav>
);

const Footer = () => {
  const dispatch = useDispatch();
  const categories = useSelector((state) => state.products.categories) || [];

  // NavBar usually loads these already; fetch only if still empty so the Shop column is real data.
  useEffect(() => {
    if (categories.length === 0) dispatch(fetchCategories());
  }, [dispatch]);

  const { contact, policy, social, payments } = SITE;
  const year = new Date().getFullYear();

  const trust = [
    { Icon: LuBanknote, title: "Cash on Delivery", text: "Pay when your order arrives" },
    { Icon: LuShieldCheck, title: "Secure checkout", text: "Your details stay private" },
    {
      Icon: LuUndo2,
      title: policy.returnDays ? `${policy.returnDays}-day returns` : "Easy returns",
      text: "Simple, no-fuss returns",
    },
    { Icon: LuTruck, title: `Delivery across ${SITE.country}`, text: policy.deliveryDays },
  ];

  // Empty strings are hidden, never replaced with made-up values (see config/site.js).
  const contactLines = [
    contact.email && { Icon: LuMail, text: contact.email, href: `mailto:${contact.email}` },
    contact.phone && { Icon: LuPhone, text: contact.phone, href: `tel:${contact.phone.replace(/[^\d+]/g, "")}` },
    contact.address && { Icon: LuMapPin, text: contact.address },
    contact.hours && { Icon: LuClock, text: contact.hours },
  ].filter(Boolean);

  const socials = SOCIALS.filter((s) => social[s.key]);

  const shopLinks = [
    // filterSync makes FilterPage read the (empty) URL instead of keeping old redux filters,
    // so "All products" really shows everything.
    { to: "/filter", label: "All products", state: { filterSync: true } },
    ...categories.slice(0, CATEGORY_LIMIT).map((c) => ({ to: `/filter?category=${c._id}`, label: c.name })),
  ];

  return (
    <footer className="sz-footer">
      <div className="container">
        <ul className="sz-footer__trust" aria-label="Why shop with us">
          {trust.map(({ Icon, title, text }) => (
            <li key={title} className="sz-footer__trust-item">
              <span className="sz-footer__trust-icon"><Icon aria-hidden="true" /></span>
              <span>
                <strong>{title}</strong>
                {text && <span className="sz-footer__trust-text">{text}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="sz-footer__main">
          <div className="sz-footer__brand">
            <Link to="/" className="sz-footer__logo" aria-label={`${SITE.name} home`}>
              <span className="sz-footer__logo-mark"><LuShoppingBag aria-hidden="true" /></span>
              <span className="sz-footer__logo-text">{SITE.name}</span>
            </Link>
            {SITE.tagline && <p className="sz-footer__tagline">{SITE.tagline}</p>}
            {contactLines.length > 0 && (
              <ul className="sz-footer__contact">
                {contactLines.map(({ Icon, text, href }) => (
                  <li key={text}>
                    <Icon aria-hidden="true" />
                    {href ? <a href={href}>{text}</a> : <span>{text}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <LinkColumn id="sz-footer-shop" title="Shop" links={shopLinks} />
          <LinkColumn
            id="sz-footer-account"
            title="My account"
            links={[
              { to: "/profile", label: "Profile" },
              { to: "/orders", label: "Orders" },
              { to: "/wishlist", label: "Wishlist" },
              { to: "/cart", label: "Cart" },
            ]}
          />
          <LinkColumn
            id="sz-footer-help"
            title="Help"
            links={[
              { to: "/contact", label: "Contact us" },
              { to: "/shipping", label: "Shipping & delivery" },
              { to: "/returns", label: "Returns & refunds" },
            ]}
          />
          <LinkColumn
            id="sz-footer-legal"
            title="Legal"
            links={[
              { to: "/terms", label: "Terms & conditions" },
              { to: "/privacy", label: "Privacy policy" },
            ]}
          />
        </div>

        {payments?.length > 0 && (
          <div className="sz-footer__pay">
            <span className="sz-footer__pay-label">We accept</span>
            <ul className="sz-footer__pills">
              {payments.map((p) => {
                const Icon = paymentIcon(p);
                return (
                  <li key={p} className="sz-footer__pill">
                    <Icon aria-hidden="true" />
                    {p}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="sz-footer__bottom">
        <div className="container sz-footer__bottom-inner">
          <p>© {year} {SITE.name}. All rights reserved.</p>
          {socials.length > 0 && (
            <ul className="sz-footer__social" aria-label="Follow us">
              {socials.map(({ key, label, Icon }) => (
                <li key={key}>
                  <a href={social[key]} target="_blank" rel="noopener noreferrer" aria-label={label}>
                    <Icon aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
