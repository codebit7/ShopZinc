import { Link } from "react-router-dom";
import { FiClock, FiMail, FiMapPin, FiMessageCircle, FiPhone } from "react-icons/fi";
import { SITE } from "../../config/site";
import InfoPage from "./InfoPage";

const c = SITE.contact || {};

// Only real, filled-in details become cards; an empty field in site.js means "not decided yet",
// and showing a blank or invented number would send customers nowhere.
const methods = [
  c.email && {
    key: "email",
    icon: FiMail,
    label: "Email",
    value: <a href={`mailto:${c.email}`}>{c.email}</a>,
  },
  c.phone && {
    key: "phone",
    icon: FiPhone,
    label: "Phone",
    value: <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>,
  },
  c.whatsapp && c.whatsapp.replace(/\D/g, "") && {
    key: "whatsapp",
    icon: FiMessageCircle,
    label: "WhatsApp",
    // wa.me needs digits only (country code, no "+", spaces or dashes).
    value: (
      <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
        {c.whatsapp}
      </a>
    ),
  },
  c.address && { key: "address", icon: FiMapPin, label: "Address", value: c.address },
  c.hours && { key: "hours", icon: FiClock, label: "Hours", value: c.hours },
].filter(Boolean);

const ContactPage = () => (
  <InfoPage
    title="Contact us"
    subtitle={`Questions about an order, a product or your account? The ${SITE.name} team is happy to help.`}
    updated="September 2026"
    toc={false}
    sections={[
      {
        id: "reach-us",
        title: "How to reach us",
        body: methods.length ? (
          <ul className="info-cards">
            {methods.map(({ key, icon: Icon, label, value }) => (
              <li key={key}>
                <div className="info-card">
                  <span className="info-card-icon" aria-hidden="true"><Icon /></span>
                  <div className="info-card-main">
                    <span className="info-card-label">{label}</span>
                    <span className="info-card-value">{value}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="info-empty">Contact details will be added soon.</p>
        ),
      },
      {
        id: "before",
        title: "Before you contact us",
        body: (
          <>
            <p>You may find your answer faster here:</p>
            <ul>
              <li><Link to="/orders">Track an order</Link>: see the status of every order you have placed.</li>
              <li><Link to="/returns">Returns &amp; refunds</Link>: how to return an item and when you get your money back.</li>
              <li><Link to="/shipping">Shipping &amp; delivery</Link>: where we deliver and how long it takes.</li>
            </ul>
            <p>When you write to us about an order, please include your order number so we can help you quickly.</p>
          </>
        ),
      },
    ]}
  />
);

export default ContactPage;
