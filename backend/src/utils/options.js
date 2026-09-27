// Product choices (Size, Color, ...). One place for the rules, shared by products, cart and orders.
// Pure: no DB, so it can be checked without Mongo.
//   product.options  = [{ name: 'Size', values: ['S', 'M', 'L'], extras: [0, 0, 200] }]
//                      extras[i] = Rs added to the price for values[i]; missing/short = 0
//   cart/order line  = selected: [{ name: 'Size', value: 'M' }]
// A product with no options works exactly as before: selected is always [].

const MAX_OPTIONS = 5
const MAX_VALUES = 30

// Admin input -> clean options. Accepts an array or a JSON string (multipart sends strings).
// Returns { options } or { error }.
function cleanOptions(raw) {
  let list = raw
  if (typeof raw === 'string') {
    try { list = raw.trim() ? JSON.parse(raw) : [] } catch { return { error: 'options must be a JSON array' } }
  }
  if (list === undefined || list === null) list = []
  if (!Array.isArray(list)) return { error: 'options must be a JSON array' }

  const options = []
  const seenNames = new Set()
  for (const group of list) {
    const name = typeof group?.name === 'string' ? group.name.trim() : ''
    // Why drop, not fail: the admin form may send a half-filled blank row.
    if (!name) continue
    if (seenNames.has(name.toLowerCase())) return { error: `Choice "${name}" is listed twice` }
    seenNames.add(name.toLowerCase())

    const seenValues = new Set()
    const values = []
    const extras = []
    const rawExtras = Array.isArray(group.extras) ? group.extras : []
    const rawValues = Array.isArray(group.values) ? group.values : []
    for (let i = 0; i < rawValues.length; i++) {
      const v = rawValues[i]
      const value = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
      // Case-insensitive de-dupe: "Red" and "red" would look like two buttons for one colour.
      if (!value || seenValues.has(value.toLowerCase())) continue
      // Extra price for this value; blank = 0. Negative is refused: a choice can't make it cheaper
      // than the base price shown on the cards ("From Rs ...").
      const rawExtra = rawExtras[i]
      const extra = rawExtra === undefined || rawExtra === null || rawExtra === '' ? 0 : Number(rawExtra)
      if (!Number.isFinite(extra) || extra < 0) return { error: `Extra price for "${value}" must be 0 or more` }
      seenValues.add(value.toLowerCase())
      values.push(value)
      extras.push(Math.round(extra * 100) / 100)
    }
    if (values.length === 0) return { error: `Add at least one value for "${name}"` }
    if (values.length > MAX_VALUES) return { error: `"${name}" can have at most ${MAX_VALUES} values` }
    options.push({ name, values, extras })
  }
  if (options.length > MAX_OPTIONS) return { error: `A product can have at most ${MAX_OPTIONS} choices` }
  return { options }
}

// Shopper's pick -> checked selection, in the product's option order.
// raw may be { Size: 'M' } or [{ name, value }]. Unknown names are ignored.
// Returns { selected } or { error }.
function pickSelection(productOptions, raw) {
  const options = Array.isArray(productOptions) ? productOptions : []
  const byName = new Map()
  if (Array.isArray(raw)) {
    for (const s of raw) if (s && typeof s.name === 'string') byName.set(s.name, s.value)
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) byName.set(k, v)
  }

  const selected = []
  for (const opt of options) {
    const value = byName.get(opt.name)
    // Why exact match: the value is stored on the order, so it must be one the admin offered.
    if (typeof value !== 'string' || !opt.values.includes(value)) {
      return { error: `Please choose a ${opt.name}` }
    }
    selected.push({ name: opt.name, value })
  }
  return { selected }
}

// Total extra Rs for a pick, from the product's CURRENT options (so an admin price change shows
// up in the cart). A value no longer offered adds 0 rather than failing the whole cart.
function extraFor(productOptions, selected = []) {
  const options = Array.isArray(productOptions) ? productOptions : []
  let extra = 0
  for (const s of selected || []) {
    const opt = options.find((o) => o.name === s.name)
    if (!opt) continue
    const i = opt.values.indexOf(s.value)
    if (i > -1) extra += Number(opt.extras && opt.extras[i]) || 0
  }
  return extra
}

// Two cart lines are the same line only when product AND every choice match.
function sameSelection(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.name === b[i].name && s.value === b[i].value)
}

// Stable text key for a selection, e.g. "Size=M|Color=Red". Used to group order lines.
function selectionKey(selected = []) {
  return selected.map((s) => `${s.name}=${s.value}`).join('|')
}

module.exports = { cleanOptions, pickSelection, sameSelection, selectionKey, extraFor, MAX_OPTIONS, MAX_VALUES }
