// Checks the sales/profit report math (utils/report.js). No DB needed.
//   node src/scripts/check-report.js
const assert = require('assert')
const { parseReportQuery, buildSalesReport } = require('../utils/report.js')

const PKT = -300 // Pakistan: UTC+5, as the browser reports it

// ---- query checks
assert.ok(parseReportQuery({ from: '2026-09-10', to: '2026-09-01' }).error, 'from after to')
assert.ok(parseReportQuery({ from: '2026-02-31', to: '2026-03-01' }).error, 'impossible date')
assert.ok(parseReportQuery({ from: 'x', to: '2026-03-01' }).error, 'bad date')
assert.ok(parseReportQuery({ from: '2020-01-01', to: '2026-01-01', groupBy: 'day' }).error, 'too many days')
assert.ok(!parseReportQuery({ from: '2020-01-01', to: '2024-12-31', groupBy: 'month' }).error, '5 years by month is fine')
let r = parseReportQuery({ from: '2026-09-01', to: '2026-09-30', groupBy: 'day', tzOffset: PKT })
assert.strictEqual(r.start.toISOString(), '2026-08-31T19:00:00.000Z', 'Sep 1 00:00 in Pakistan = Aug 31 19:00 UTC')
assert.strictEqual(r.end.toISOString(), '2026-09-30T19:00:00.000Z')
assert.strictEqual(r.prevStart.toISOString(), '2026-08-01T19:00:00.000Z', 'previous period = the 30 days before')
console.log('OK parseReportQuery')

// ---- report
const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa', P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const order = (iso, total, items, extra = {}) => ({ orderDate: new Date(iso), totalAmount: total, orderStatus: 'processing', paymentStatus: 'pending', items, ...extra })
const orders = [
  // 2026-09-01 02:00 Pakistan time = 2026-08-31 21:00 UTC -> must land on Sep 1, not Aug 31.
  order('2026-08-31T21:00:00Z', 1000, [{ product: P1, quantity: 2, priceAtTimeOfOrder: 500, costAtTimeOfOrder: 300 }], { paymentStatus: 'paid' }),
  // No cost price on this line: counted in sales, left out of profit.
  order('2026-09-02T10:00:00Z', 400, [{ product: P2, quantity: 1, priceAtTimeOfOrder: 400, costAtTimeOfOrder: null }]),
  // Loss: sold under cost.
  order('2026-09-08T10:00:00Z', 200, [{ product: P1, quantity: 1, priceAtTimeOfOrder: 200, costAtTimeOfOrder: 300 }]),
  // Cancelled: not revenue.
  order('2026-09-03T10:00:00Z', 999, [{ product: P1, quantity: 9, priceAtTimeOfOrder: 111, costAtTimeOfOrder: 1 }], { orderStatus: 'cancelled' }),
  // Previous period.
  order('2026-08-15T10:00:00Z', 700, [{ product: P1, quantity: 1, priceAtTimeOfOrder: 700, costAtTimeOfOrder: 500 }]),
  // Outside everything.
  order('2025-01-01T10:00:00Z', 5000, [{ product: P1, quantity: 1, priceAtTimeOfOrder: 5000, costAtTimeOfOrder: 1 }]),
]
const names = new Map([[P1, 'Shirt'], [P2, 'Phone']])

r = buildSalesReport(orders, parseReportQuery({ from: '2026-09-01', to: '2026-09-30', groupBy: 'day', tzOffset: PKT }), names)
const t = r.totals
assert.strictEqual(t.revenue, 1600, '1000 + 400 + 200, cancelled excluded')
assert.strictEqual(t.orders, 3)
assert.strictEqual(t.cancelled, 1)
assert.strictEqual(t.itemsSold, 4)
assert.strictEqual(t.cost, 900, '2*300 + 1*300; the no-cost line adds nothing')
assert.strictEqual(t.profit, 300, '(1000 + 200) - 900')
assert.strictEqual(t.profitCoverage, 0.75, '1200 of 1600 sales have a cost')
assert.strictEqual(t.margin, 0.25)
assert.strictEqual(t.paidRevenue, 1000)
assert.strictEqual(t.avgOrder, 533.33)
assert.strictEqual(r.previous.revenue, 700)
assert.strictEqual(r.previous.profit, 200)
assert.strictEqual(r.series.length, 30, 'every day present, even empty ones')
assert.strictEqual(r.series[0].start, '2026-09-01')
assert.strictEqual(r.series[0].revenue, 1000, 'late-night order lands on the local day')
assert.strictEqual(r.series[7].profit, -100, 'a loss shows as negative profit')
assert.strictEqual(r.series[2].revenue, 0, 'cancelled-only day has no revenue')
assert.strictEqual(r.series[2].cancelled, 1)
assert.deepStrictEqual(r.topProducts.map((p) => [p.name, p.revenue]), [['Shirt', 1200], ['Phone', 400]])
console.log('OK day report')

// Weeks start on Monday; Sep 1 2026 is a Tuesday, so the first bucket is clipped to start Sep 1.
r = buildSalesReport(orders, parseReportQuery({ from: '2026-09-01', to: '2026-09-30', groupBy: 'week', tzOffset: PKT }), names)
assert.strictEqual(r.series[0].start, '2026-09-01')
assert.strictEqual(r.series[0].end, '2026-09-06', 'first week ends on Sunday')
assert.strictEqual(r.series[1].start, '2026-09-07')
assert.strictEqual(r.series[0].revenue, 1400)
assert.strictEqual(r.series[1].revenue, 200)
assert.strictEqual(r.series[r.series.length - 1].end, '2026-09-30', 'last week clipped to the range end')
console.log('OK week report')

r = buildSalesReport(orders, parseReportQuery({ from: '2026-01-01', to: '2026-12-31', groupBy: 'month', tzOffset: PKT }), names)
assert.strictEqual(r.series.length, 12)
assert.strictEqual(r.series[8].start, '2026-09-01')
assert.strictEqual(r.series[8].revenue, 1600)
assert.strictEqual(r.series[7].revenue, 700)
console.log('OK month report')

r = buildSalesReport([], parseReportQuery({ from: '2026-09-01', to: '2026-09-30', groupBy: 'day' }))
assert.strictEqual(r.totals.revenue, 0)
assert.strictEqual(r.totals.margin, null, 'no sales = margin unknown, not 0%')
assert.strictEqual(r.totals.profitCoverage, 0)
console.log('OK empty report')

console.log('ALL OK')
