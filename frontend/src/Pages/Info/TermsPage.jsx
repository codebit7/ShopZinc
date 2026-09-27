import { Link } from "react-router-dom";
import { SITE } from "../../config/site";
import InfoPage from "./InfoPage";

const payments = SITE.payments || [];

const TermsPage = () => (
  <InfoPage
    title="Terms & conditions"
    subtitle={`The rules for using the ${SITE.name} website and buying from us.`}
    updated="September 2026"
    template
    sections={[
      {
        id: "acceptance",
        title: "Acceptance of these terms",
        body: (
          <p>By using this website or placing an order, you agree to these terms. If you do not agree, please do not use the website.</p>
        ),
      },
      {
        id: "accounts",
        title: "Your account",
        body: (
          <>
            <p>You need an account to place orders. You must give correct information and keep it up to date.</p>
            <p>You are responsible for keeping your password safe and for everything that happens under your account. Tell us straight away if you think someone else has used it. We may suspend accounts that break these terms.</p>
          </>
        ),
      },
      {
        id: "orders",
        title: "Orders and pricing",
        body: (
          <>
            <p>All prices are shown in Pakistani Rupees (PKR). We try to keep prices and product details correct, but mistakes can happen. If a price is clearly wrong, we may cancel the order and refund any amount paid.</p>
            <p>Placing an order is an offer to buy. We may accept or decline an order, for example if an item is out of stock or we cannot deliver to your address. An order is accepted when we confirm or ship it.</p>
          </>
        ),
      },
      payments.length > 0 && {
        id: "payment",
        title: "Payment",
        body: (
          <>
            <p>We currently accept:</p>
            <ul>
              {payments.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p>Online payments are handled by the payment provider on their own page. We may cancel an order if payment is not completed.</p>
          </>
        ),
      },
      {
        id: "delivery",
        title: "Delivery",
        body: (
          <p>Delivery times are estimates, not guarantees. See <Link to="/shipping">Shipping &amp; delivery</Link> for details. The risk of loss passes to you once the parcel is delivered to your address.</p>
        ),
      },
      {
        id: "returns",
        title: "Returns and refunds",
        body: (
          <p>Returns and refunds follow our <Link to="/returns">Returns &amp; refunds</Link> policy. Nothing in these terms takes away rights you have under Pakistani consumer law.</p>
        ),
      },
      {
        id: "ip",
        title: "Intellectual property",
        body: (
          <p>The content on this website, including text, images, logos and design, belongs to {SITE.name} or its suppliers. You may not copy, reuse or sell it without written permission.</p>
        ),
      },
      {
        id: "liability",
        title: "Limitation of liability",
        body: (
          <p>To the extent the law allows, {SITE.name} is not liable for indirect or unexpected losses from using the website or our products. Our total liability for any order is limited to the amount you paid for that order.</p>
        ),
      },
      {
        id: "law",
        title: "Governing law",
        body: (
          <p>These terms are governed by the laws of Pakistan. Any dispute will be handled by the courts of Pakistan.</p>
        ),
      },
      {
        id: "changes",
        title: "Changes to these terms",
        body: (
          <p>We may update these terms from time to time. The date at the top of this page shows the latest version. Orders are covered by the terms in force when they were placed.</p>
        ),
      },
      {
        id: "contact",
        title: "Contact",
        body: (
          <p>Questions about these terms? Please <Link to="/contact">contact us</Link>.</p>
        ),
      },
    ].filter(Boolean)}
  />
);

export default TermsPage;
