import { Link } from "react-router-dom";
import { SITE } from "../../config/site";
import InfoPage from "./InfoPage";

const { deliveryDays } = SITE.policy || {};
const hasCod = (SITE.payments || []).includes("Cash on Delivery");

// Courier names and fees are not decided yet, so this page stays generic on purpose.
const ShippingPage = () => (
  <InfoPage
    title="Shipping & delivery"
    subtitle="Where we deliver, how long it takes, and how to follow your parcel."
    updated="September 2026"
    sections={[
      {
        id: "where",
        title: "Where we deliver",
        body: SITE.country ? (
          <p>We deliver to addresses across {SITE.country}. Enter your full address at checkout, including your city and postal code, so the courier can find you.</p>
        ) : (
          <p>Enter your full address at checkout, including your city and postal code, so the courier can find you.</p>
        ),
      },
      {
        id: "time",
        title: "Delivery time",
        body: (
          <>
            {/* Hidden when site.js leaves it blank, so we never promise a made-up time. */}
            {deliveryDays && (
              <p className="info-callout">Most orders arrive in <strong>{deliveryDays}</strong> after they are confirmed.</p>
            )}
            <p>Delivery can take longer in remote areas, during sales and public holidays, or because of weather and other events outside our control.</p>
          </>
        ),
      },
      {
        id: "processing",
        title: "Order processing",
        body: (
          <p>After you place an order, we check it, pack it and hand it to our delivery partner. Orders placed on Sundays or public holidays may be processed on the next working day. If an item is out of stock, we will contact you before sending anything.</p>
        ),
      },
      hasCod && {
        id: "cod",
        title: "Cash on Delivery",
        body: (
          <>
            <p>You can pay in cash when your parcel arrives. Please keep the exact amount ready if you can, as the rider may not carry change.</p>
            <p>Please check the parcel from the outside before you pay. If the packaging is badly damaged, you can refuse it and <Link to="/contact">contact us</Link>.</p>
          </>
        ),
      },
      {
        id: "tracking",
        title: "Tracking your order",
        body: (
          <p>You can see the status of every order on your <Link to="/orders">Orders</Link> page after you log in. The status changes as your order is processed, shipped and delivered.</p>
        ),
      },
      {
        id: "not-home",
        title: "If you are not at home",
        body: (
          <p>The courier will usually try to call you, or try again on another day. If a delivery cannot be completed after a few attempts, the parcel may come back to us and the order may be cancelled. Please make sure your address and contact details are correct.</p>
        ),
      },
      {
        id: "help",
        title: "Need help?",
        body: (
          <p>If your order is late or something looks wrong, please <Link to="/contact">contact us</Link> with your order number.</p>
        ),
      },
    ].filter(Boolean)}
  />
);

export default ShippingPage;
