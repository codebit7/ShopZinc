import { Link } from "react-router-dom";
import { FiAlertCircle } from "react-icons/fi";

// Unknown /admin/... paths used to fall through to a bare page with no admin chrome.
const AdminNotFound = () => (
  <div className="adm-card">
    <div className="adm-empty">
      <FiAlertCircle aria-hidden="true" />
      <h4>Page not found</h4>
      <p>This admin page does not exist.</p>
      <Link to="/admin/dashboard" className="adm-btn primary">Go to dashboard</Link>
    </div>
  </div>
);

export default AdminNotFound;
