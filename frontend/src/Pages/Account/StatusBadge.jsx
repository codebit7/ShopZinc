import { ORDER_STATUS } from "./orderUtils";

// One badge for list and details so a status always looks the same.
const StatusBadge = ({ status }) => (
  <span className={`ord-badge ord-badge--${ORDER_STATUS[status] ? status : "unknown"}`}>
    <span className="ord-badge-dot" aria-hidden="true" />
    {ORDER_STATUS[status] || status || "Unknown"}
  </span>
);

export default StatusBadge;
