// Checks product choices (Size, Color...): cleaning admin input, checking the shopper's pick,
// cart line merging / shared stock, and order lines. No DB needed.
//   node src/scripts/check-options.js
const assert = require('assert')
const { cleanOptions, pickSelection } = require('../utils/options.js')
const { planAdd, findLine } = require('../controllers/CartController.js')
const { buildOrderLines } = require('../controllers/orderControllers.js')
const { extraFor } = require('../utils/options.js')
const { unitPrice, cartTotals } = require('../utils/pricing.js')

// ---- cleanOptions
let r = cleanOptions(JSON.stringify([{ name: ' Size ', values: ['S', ' M ', 'm', '', 'L'] }, { name: '', values: [] }]))
// assert.deepStrictEqual(r.options, [{ name: 'Size', values: ['S', 'M', 'L'] }], 'trim, de-dupe, drop blank row')
assert.deepStrictEqual(r.options, [{ name: 'Size', values: ['S', 'M', 'L'], extras: [0, 0, 0] }], 'trim, de-dupe, drop blank row')
assert.deepStrictEqual(cleanOptions(undefined).options, [], 'nothing sent = no choices')
assert.deepStrictEqual(cleanOptions('[]').options, [], '"[]" = no choices')
assert.ok(cleanOptions('not json').error, 'bad JSON is an error')
assert.ok(cleanOptions([{ name: 'Size', values: [] }]).error, 'a name with no values is an error')
assert.ok(cleanOptions([{ name: 'Size', values: ['S'] }, { name: 'size', values: ['M'] }]).error, 'duplicate name is an error')
r = cleanOptions([{ name: 'Storage', values: ['128GB', '256GB', '128gb'], extras: ['', '20000', 5] }])
assert.deepStrictEqual(r.options[0].extras, [0, 20000], 'blank = 0, string cast, extra stays with its value after de-dupe')
assert.ok(cleanOptions([{ name: 'S', values: ['a'], extras: [-5] }]).error, 'negative extra is an error')
assert.ok(cleanOptions([{ name: 'S', values: ['a'], extras: ['abc'] }]).error, 'non-number extra is an error')
console.log('OK cleanOptions')

// ---- pickSelection
const opts = [{ name: 'Size', values: ['S', 'M'] }, { name: 'Color', values: ['Red', 'Blue'] }]
assert.deepStrictEqual(pickSelection(opts, { Color: 'Red', Size: 'M', Junk: 'x' }).selected,
  [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Red' }], 'product order, unknown names dropped')
assert.strictEqual(pickSelection(opts, { Size: 'M' }).error, 'Please choose a Color', 'missing choice')
assert.strictEqual(pickSelection(opts, { Size: 'XXL', Color: 'Red' }).error, 'Please choose a Size', 'value not offered')
assert.deepStrictEqual(pickSelection([], { Size: 'M' }).selected, [], 'product without choices ignores the pick')
assert.deepStrictEqual(pickSelection(undefined, undefined).selected, [], 'old product, old client')
console.log('OK pickSelection')

// ---- planAdd: sizes are separate lines, but share one stock
const P = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const M = [{ name: 'Size', value: 'M' }]
const L = [{ name: 'Size', value: 'L' }]
const items = [{ _id: 'line1', product: P, quantity: 2, selected: M }]
let plan = planAdd(items, P, 1, 5, L)
assert.strictEqual(plan.index, -1, 'Size L is a new line, not merged into Size M')
plan = planAdd(items, P, 1, 5, M)
assert.deepStrictEqual(plan, { index: 0, quantity: 3 }, 'same size merges')
assert.ok(planAdd(items, P, 4, 5, L).error, '2 M + 4 L = 6 > stock 5 must be rejected')
assert.ok(!planAdd(items, P, 3, 5, L).error, '2 M + 3 L = 5 = stock is fine')
assert.deepStrictEqual(planAdd([{ product: P, quantity: 1 }], P, 1, 5, []), { index: 0, quantity: 2 },
  'no-choice product (old line with no `selected`) still merges')
console.log('OK planAdd')

// ---- findLine: line id first, product id as fallback
const two = [{ _id: 'line1', product: P, quantity: 1, selected: M }, { _id: 'line2', product: P, quantity: 1, selected: L }]
assert.strictEqual(findLine(two, 'line2'), 1, 'line id picks the exact size')
assert.strictEqual(findLine(two, P), 0, 'product id still works (first line)')
assert.strictEqual(findLine(two, 'nope'), -1)
console.log('OK findLine')

// ---- buildOrderLines keeps sizes apart and carries the pick
const prod = { _id: P, name: 'Shirt', price: 100, discount: 0 }
const built = buildOrderLines([
  { product: prod, quantity: 1, selected: M },
  { product: prod, quantity: 2, selected: L },
  { product: prod, quantity: 1, selected: M },
])
assert.strictEqual(built.lines.length, 2, 'M and L stay two order lines')
assert.deepStrictEqual(built.lines.map((l) => [l.selected[0].value, l.quantity]), [['M', 2], ['L', 2]])
assert.strictEqual(built.total, 400)
console.log('OK buildOrderLines')

// ---- extra price: base + extras, percent discount on the whole thing
const phone = {
  _id: P, name: 'Phone', price: 100000, discount: 10,
  options: [{ name: 'Storage', values: ['128GB', '256GB'], extras: [0, 20000] }, { name: 'Color', values: ['Black', 'Gold'], extras: [0, 5000] }],
}
const S256 = [{ name: 'Storage', value: '256GB' }, { name: 'Color', value: 'Gold' }]
assert.strictEqual(extraFor(phone.options, S256), 25000, 'extras from two choices add up')
assert.strictEqual(unitPrice(phone), 90000, 'no pick = base price less 10%')
assert.strictEqual(unitPrice(phone, S256), 112500, '(100000 + 25000) less 10%')
assert.strictEqual(extraFor([{ name: 'Size', values: ['S'] }], [{ name: 'Size', value: 'S' }]), 0, 'old data without extras = 0')
const t = cartTotals([{ product: phone, quantity: 2, selected: S256 }, { product: phone, quantity: 1, selected: [] }])
assert.deepStrictEqual(t, { subtotal: 350000, discount: 35000, total: 315000 }, 'cart totals include extras')
const o = buildOrderLines([{ product: phone, quantity: 1, selected: S256 }])
assert.strictEqual(o.lines[0].priceAtTimeOfOrder, 112500, 'order freezes the price with the extra')
console.log('OK extra prices')

console.log('ALL OK')
