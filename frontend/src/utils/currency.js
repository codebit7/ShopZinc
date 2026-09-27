// Why: the store sells in Pakistani Rupees. One formatter keeps every price on the site
// looking the same; before this, each page had its own "$" / USD helper.
export const CURRENCY = "PKR";

// Rupees are shown whole (no paisa). en-PK gives "Rs 1,499" in Node/Chrome ICU.
const fmt = new Intl.NumberFormat("en-PK", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 });

// null / undefined / NaN would print "Rs NaN" — show "Rs 0" instead.
export const formatPrice = (n) => {
  const v = Number(n);
  return fmt.format(Number.isFinite(v) ? v : 0);
};
