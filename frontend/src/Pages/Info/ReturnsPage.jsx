import { Link } from "react-router-dom";
import { SITE } from "../../config/site";
import InfoPage from "./InfoPage";

const { returnDays, refundDays } = SITE.policy || {};

const ReturnsPage = () => (
  <InfoPage
    title="Returns & refunds"
    subtitle="Changed your mind, or something is not right? Here is how returns and refunds work."
    updated="September 2026"
    template
    sections={[
      {
        id: "window",
        title: "Return window",
        body: (
          <>
            {/* Blank in site.js = not decided yet, so the number is hidden instead of guessed. */}
            {returnDays ? (
              <p className="info-callout">You can ask to return most items within <strong>{returnDays} days</strong> of delivery.</p>
            ) : (
              <p>You can ask to return most items within a limited time after delivery.</p>
            )}
            <p>Please start your request as soon as you can. Requests made after the return window may not be accepted.</p>
          </>
        ),
      },
      {
        id: "conditions",
        title: "Conditions for a return",
        body: (
          <>
            <p>To be accepted, a returned item must be:</p>
            <ul>
              <li>Unused, unwashed and in the same condition you received it.</li>
              <li>In its original packaging, with all tags, accessories, manuals and free gifts.</li>
              <li>Sent back with the order number, so we can match it to your order.</li>
            </ul>
          </>
        ),
      },
      {
        id: "non-returnable",
        title: "Items that cannot be returned",
        body: (
          <>
            <p>For health and safety reasons, some items cannot be returned unless they arrived damaged or wrong. For example:</p>
            <ul>
              <li>Personal care and beauty products that have been opened.</li>
              <li>Underwear, socks and swimwear.</li>
              <li>Food and other perishable items.</li>
              <li>Gift cards, and items marked as final sale on the product page.</li>
            </ul>
          </>
        ),
      },
      {
        id: "how",
        title: "How to request a return",
        body: (
          <ol>
            <li><Link to="/contact">Contact us</Link> with your order number, the item you want to return, and the reason.</li>
            <li>We will check your request and tell you how to send the item back.</li>
            <li>Pack the item safely in its original packaging.</li>
            <li>Once the item reaches us, we inspect it and let you know the result.</li>
          </ol>
        ),
      },
      {
        id: "refunds",
        title: "Refunds",
        body: (
          <>
            {refundDays ? (
              <p>After we receive and approve your return, we send your refund within <strong>{refundDays}</strong>.</p>
            ) : (
              <p>After we receive and approve your return, we send your refund as soon as we can.</p>
            )}
            <ul>
              <li><strong>Cash on Delivery orders:</strong> refunded by bank transfer or to your mobile wallet. We will ask you for the account details.</li>
              <li><strong>Online payments:</strong> refunded to the same method you paid with.</li>
            </ul>
            <p>Your bank or wallet provider may take a few extra days to show the money in your account.</p>
          </>
        ),
      },
      {
        id: "damaged",
        title: "Damaged or wrong item",
        body: (
          <>
            <p>If your item arrives damaged, faulty or different from what you ordered, please <Link to="/contact">contact us</Link> within 48 hours of delivery. Photos of the item and the packaging help us sort it out quickly.</p>
            <p>In these cases we will replace the item or refund you in full, and you will not pay for the return.</p>
          </>
        ),
      },
    ]}
  />
);

export default ReturnsPage;
