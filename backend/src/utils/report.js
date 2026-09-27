// Sales / profit report math. Pure: no DB, so it can be checked without Mongo.
//
// Dates are calendar days in the ADMIN's timezone, not the server's: "September" must mean the
// admin's September. tzOffset = the browser's new Date().getTimezoneOffset() (minutes, UTC - local;
// Pakistan = -300).
//
// Money rules:
//   revenue  = sum of order totals (cancelled orders excluded, counted separately)
//   cost     = sum of qty * costAtTimeOfOrder, only for lines that HAVE a cost
//   profit   = revenue of lines with a cost - their cost. Lines without a cost are left out of
//              profit (not counted as 100% profit), and `profitCoverage` says how much of revenue
//              the profit figure covers.

const GROUPS = ['day', 'week', 'month', 'year']
// Enough for a year by day or 5 years by week, small enough to draw.
const MAX_BUCKETS = 400
const DAY = 86400000

const round2 = (n) => Math.round(Number(n) * 100) / 100

// "2026-09-27" -> { y, m (0-11), d } or null.
function parseDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''))
  if (!m) return null
  const y = +m[1], mo = +m[2] - 1, d = +m[3]
  const t = Date.UTC(y, mo, d)
  const back = new Date(t)
  // Rejects 2026-02-31 and friends.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null
  return { y, m: mo, d }
}

const pad = (n) => String(n).padStart(2, '0')
// "Local calendar ms" (UTC fields = admin's local fields) -> "YYYY-MM-DD".
const dayKey = (localMs) => {
  const x = new Date(localMs)
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}

// Start of the bucket (in local calendar ms) that contains localMs.
function bucketStart(localMs, groupBy) {
  const x = new Date(localMs)
  const y = x.getUTCFullYear(), m = x.getUTCMonth(), d = x.getUTCDate()
  if (groupBy === 'year') return Date.UTC(y, 0, 1)
  if (groupBy === 'month') return Date.UTC(y, m, 1)
  const day = Date.UTC(y, m, d)
  if (groupBy === 'week') {
    // Weeks start on Monday.
    const dow = (x.getUTCDay() + 6) % 7
    return day - dow * DAY
  }
  return day
}

function nextBucket(startMs, groupBy) {
  const x = new Date(startMs)
  if (groupBy === 'year') return Date.UTC(x.getUTCFullYear() + 1, 0, 1)
  if (groupBy === 'month') return Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1)
  return startMs + (groupBy === 'week' ? 7 : 1) * DAY
}

// Checks the query. Returns { error } or the range in both local calendar ms and real UTC Dates:
// { groupBy, tzOffset, fromLocal, toLocalEnd, start, end, prevStart }  (end/toLocalEnd exclusive)
function parseReportQuery(q = {}) {
  const groupBy = GROUPS.includes(q.groupBy) ? q.groupBy : 'day'
  const tzRaw = q.tzOffset === undefined || q.tzOffset === '' ? 0 : Number(q.tzOffset)
  if (!Number.isFinite(tzRaw) || Math.abs(tzRaw) > 14 * 60) return { error: 'Invalid timezone' }
  const tzOffset = Math.round(tzRaw)

  const f = parseDay(q.from), t = parseDay(q.to)
  if (!f || !t) return { error: 'from and to must be dates like 2026-09-01' }
  const fromLocal = Date.UTC(f.y, f.m, f.d)
  const toLocalEnd = Date.UTC(t.y, t.m, t.d) + DAY
  if (toLocalEnd <= fromLocal) return { error: '"from" must be on or before "to"' }
  if (toLocalEnd - fromLocal > 366 * 5 * DAY) return { error: 'Pick a range of 5 years or less' }

  // Count buckets up front: 3 years by day would be 1,000+ bars nobody can read.
  let n = 0
  for (let b = bucketStart(fromLocal, groupBy); b < toLocalEnd; b = nextBucket(b, groupBy)) {
    if (++n > MAX_BUCKETS) return { error: `Too many ${groupBy}s in this range. Group by a longer period.` }
  }

  // local calendar ms -> real instant: local = utc - offset  =>  utc = local + offset
  const toUtc = (localMs) => new Date(localMs + tzOffset * 60000)
  const span = toLocalEnd - fromLocal
  return {
    groupBy, tzOffset, fromLocal, toLocalEnd,
    start: toUtc(fromLocal),
    end: toUtc(toLocalEnd),
    // The same length of time just before, for "growth vs previous period".
    prevStart: toUtc(fromLocal - span),
  }
}

function emptyTotals() {
  return { revenue: 0, orders: 0, itemsSold: 0, cost: 0, costedRevenue: 0, lineRevenue: 0, paidRevenue: 0, cancelled: 0 }
}

// Adds one order into a totals object.
function addOrder(t, order) {
  if (order.orderStatus === 'cancelled') { t.cancelled += 1; return }
  const total = Number(order.totalAmount) || 0
  t.revenue += total
  t.orders += 1
  if (order.paymentStatus === 'paid') t.paidRevenue += total
  for (const it of order.items || []) {
    const qty = Number(it.quantity) || 0
    const line = (Number(it.priceAtTimeOfOrder) || 0) * qty
    t.itemsSold += qty
    t.lineRevenue += line
    if (typeof it.costAtTimeOfOrder === 'number') {
      t.cost += it.costAtTimeOfOrder * qty
      t.costedRevenue += line
    }
  }
}

function finishTotals(t) {
  const profit = t.costedRevenue - t.cost
  return {
    revenue: round2(t.revenue),
    orders: t.orders,
    itemsSold: t.itemsSold,
    avgOrder: t.orders ? round2(t.revenue / t.orders) : 0,
    cost: round2(t.cost),
    profit: round2(profit),
    // Share of sales that has a cost price (0-1). 1 = profit is complete; 0 = no profit data.
    profitCoverage: t.lineRevenue > 0 ? round2(t.costedRevenue / t.lineRevenue) : 0,
    // Profit as a share of the sales it covers (0.25 = 25% margin). null when unknown.
    margin: t.costedRevenue > 0 ? round2(profit / t.costedRevenue) : null,
    paidRevenue: round2(t.paidRevenue),
    cancelled: t.cancelled,
  }
}

// orders: [{ _id, orderDate, orderStatus, paymentStatus, totalAmount, items: [{ product, quantity,
// priceAtTimeOfOrder, costAtTimeOfOrder }] }] covering prevStart..end.
// names: Map productId -> name (for top products).
function buildSalesReport(orders, range, names = new Map()) {
  const { groupBy, tzOffset, fromLocal, toLocalEnd, start, end, prevStart } = range

  // Every bucket in the range, even empty ones, so the chart has no gaps in time.
  const buckets = new Map()
  for (let b = bucketStart(fromLocal, groupBy); b < toLocalEnd; b = nextBucket(b, groupBy)) {
    buckets.set(b, emptyTotals())
  }

  const current = emptyTotals()
  const previous = emptyTotals()
  const products = new Map()

  for (const o of orders || []) {
    const at = new Date(o.orderDate || o.createdAt).getTime()
    if (!Number.isFinite(at)) continue
    if (at >= prevStart.getTime() && at < start.getTime()) { addOrder(previous, o); continue }
    if (at < start.getTime() || at >= end.getTime()) continue

    addOrder(current, o)
    const localMs = at - tzOffset * 60000
    const bucket = buckets.get(bucketStart(localMs, groupBy))
    if (bucket) addOrder(bucket, o)

    if (o.orderStatus === 'cancelled') continue
    for (const it of o.items || []) {
      const id = String(it.product)
      const p = products.get(id) || { productId: id, quantity: 0, revenue: 0 }
      p.quantity += Number(it.quantity) || 0
      p.revenue += (Number(it.priceAtTimeOfOrder) || 0) * (Number(it.quantity) || 0)
      products.set(id, p)
    }
  }

  const series = [...buckets].map(([b, t]) => {
    const endLocal = Math.min(nextBucket(b, groupBy), toLocalEnd)
    // start/end are the admin's local calendar days; a partial first/last bucket is clipped.
    return { start: dayKey(Math.max(b, fromLocal)), end: dayKey(endLocal - DAY), ...finishTotals(t) }
  })

  const topProducts = [...products.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({ ...p, revenue: round2(p.revenue), name: names.get(p.productId) || 'Deleted product' }))

  return {
    groupBy,
    from: dayKey(fromLocal),
    to: dayKey(toLocalEnd - DAY),
    totals: finishTotals(current),
    previous: finishTotals(previous),
    series,
    topProducts,
  }
}

module.exports = { parseReportQuery, buildSalesReport, parseDay, GROUPS, MAX_BUCKETS }
