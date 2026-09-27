// Product choices (Size, Color, ...). Server rules live in backend/src/utils/options.js.
// selected = [{ name: 'Size', value: 'M' }] on cart and order lines.
// option.extras[i] = Rs added to the price when option.values[i] is picked (missing = 0).

// "Size: M · Color: Red", or "" when the line has no choices (so callers can skip the row).
export const formatSelected = (selected) =>
  Array.isArray(selected) && selected.length
    ? selected.map((s) => `${s.name}: ${s.value}`).join(" · ")
    : "";

export const hasOptions = (product) => Array.isArray(product?.options) && product.options.length > 0;

// Extra Rs for one value of one option (0 when none set).
export const extraOf = (opt, value) => {
  const i = opt?.values?.indexOf(value) ?? -1;
  return i > -1 ? Number(opt.extras?.[i]) || 0 : 0;
};

// Total extra Rs for the shopper's picks, e.g. { Storage: "256GB" } -> 20000.
// Display only: the server works out the real price the same way (backend utils/options.js).
export const extraFor = (product, picked = {}) =>
  hasOptions(product) ? product.options.reduce((sum, o) => sum + extraOf(o, picked[o.name]), 0) : 0;

// Same, for a cart line's selected array.
export const extraForSelected = (product, selected = []) =>
  extraFor(product, Object.fromEntries((selected || []).map((s) => [s.name, s.value])));

// True when some choice costs more, so cards say "From Rs ..." instead of a fixed price.
export const hasExtras = (product) =>
  hasOptions(product) && product.options.some((o) => (o.extras || []).some((x) => Number(x) > 0));
