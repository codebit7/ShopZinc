import { Link } from "react-router-dom";
import { SITE } from "../../config/site";
import InfoPage from "./InfoPage";

// Online wallets named here must match site.js; COD needs no third-party processor.
const onlineProviders = (SITE.payments || []).filter((p) => p !== "Cash on Delivery");

const PrivacyPage = () => (
  <InfoPage
    title="Privacy policy"
    subtitle={`What information ${SITE.name} collects, why, and the choices you have.`}
    updated="September 2026"
    template
    sections={[
      {
        id: "collect",
        title: "What we collect",
        body: (
          <ul>
            <li><strong>Account details:</strong> your name, email address and password (stored only in a scrambled, hashed form).</li>
            <li><strong>Addresses:</strong> the delivery addresses you save or enter at checkout.</li>
            <li><strong>Orders:</strong> what you bought, when, the amount and the payment status.</li>
            <li><strong>Cookies:</strong> small login cookies that keep you signed in. They cannot be read by other websites or by scripts on the page. We do not use advertising or tracking cookies.</li>
          </ul>
        ),
      },
      {
        id: "why",
        title: "Why we use it",
        body: (
          <ul>
            <li>To create and secure your account.</li>
            <li>To process, deliver and support your orders, including returns and refunds.</li>
            <li>To send you messages about your account and orders, such as email verification.</li>
            <li>To prevent fraud and keep the website working safely.</li>
          </ul>
        ),
      },
      {
        id: "sharing",
        title: "Who we share it with",
        body: (
          <>
            <p>We do not sell your personal information. We share only what is needed:</p>
            <ul>
              <li><strong>Delivery partners:</strong> your name, address and contact details, so they can deliver your parcel.</li>
              {onlineProviders.length > 0 && (
                <li><strong>Payment providers ({onlineProviders.join(", ")}):</strong> online payments are made on the provider's own page. We never see or store your card details, wallet PIN or password.</li>
              )}
              <li><strong>The law:</strong> when we are required to by law or to protect our rights.</li>
            </ul>
          </>
        ),
      },
      {
        id: "retention",
        title: "How long we keep it",
        body: (
          <p>We keep your account information while your account is open. We keep order records for as long as needed for accounting, tax and legal reasons, even after an account is closed.</p>
        ),
      },
      {
        id: "security",
        title: "Security",
        body: (
          <p>Passwords are hashed, login cookies are protected from page scripts, and access to customer data is limited. No website is completely secure, so please use a strong password that you do not use anywhere else.</p>
        ),
      },
      {
        id: "rights",
        title: "Your choices and rights",
        body: (
          <ul>
            <li>You can update your name and saved addresses on your <Link to="/profile">Profile</Link> page.</li>
            <li>You can ask for a copy of your data, or ask us to delete your account, by <Link to="/contact">contacting us</Link>. Some order records may need to be kept for legal reasons.</li>
          </ul>
        ),
      },
      {
        id: "children",
        title: "Children",
        body: (
          <p>Our website is not meant for children under 18. We do not knowingly collect information from children. If you think a child has given us their information, please contact us and we will delete it.</p>
        ),
      },
      {
        id: "changes",
        title: "Changes to this policy",
        body: (
          <p>We may update this policy from time to time. The date at the top of this page shows the latest version.</p>
        ),
      },
      {
        id: "contact",
        title: "Contact",
        body: (
          <p>Questions about your privacy? Please <Link to="/contact">contact us</Link>.</p>
        ),
      },
    ]}
  />
);

export default PrivacyPage;
