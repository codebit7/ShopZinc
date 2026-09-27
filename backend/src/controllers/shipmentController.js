// Courier (PostEx) booking and tracking for orders. Admin books; tracking runs by hand or on a timer.
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const User = require('../models/userModel.js')
const Payment = require('../models/payementModel.js')
const postex = require('../utils/postex.js')

const COURIER = 'postex'

// Old orders saved before paymentMethod existed have no field; they were all cash on delivery.
const isCod = (order) => !order.paymentMethod || order.paymentMethod === 'cod'

const reply = (status, body) => ({ status, body })

// Book the parcel with PostEx (Admin). Moves the order to "shipped" and saves the tracking number.
// Core of booking, shared by the single "Book" button and "Book selected" on the Courier page.
// Returns { status, body } so a caller can book many orders in one request.
const bookOrder = async (orderId) => {
  if (!mongoose.isValidObjectId(orderId)) return reply(404, { message: 'Order not found' })
  if (!postex.isConfigured()) return reply(400, { message: 'PostEx is not set up yet (POSTEX_TOKEN is empty)' })

  const order = await Order.findById(orderId).populate('items.product', 'name')
  if (!order) return reply(404, { message: 'Order not found' })
  if (order.shipment && order.shipment.trackingNumber) {
    return reply(409, { message: `Already booked (tracking ${order.shipment.trackingNumber})` })
  }
  if (order.orderStatus !== 'processing') {
    return reply(400, { message: `Only processing orders can be booked (this one is ${order.orderStatus})` })
  }
  // An online order is shipped only once it is paid; otherwise we would ship goods for free.
  if (!isCod(order) && order.paymentStatus !== 'paid') {
    return reply(400, { message: 'This order is not paid yet. Wait for the online payment first.' })
  }
  const addr = order.shippingAddress || {}
  if (!addr.phone || !addr.city) {
    return reply(400, { message: 'This order has no phone number or city, so the courier cannot deliver it.' })
  }

  // Claim the order first: two admins (or a double click) must not create two PostEx parcels.
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, orderStatus: 'processing', 'shipment.trackingNumber': null, 'shipment.booking': { $ne: true } },
    { $set: { 'shipment.booking': true } }
  )
  if (!claimed) return reply(409, { message: 'This order is being booked or changed right now. Reload and check.' })

  const user = await User.findById(order.user).select('name')
  let booked
  try {
    // COD: the rider collects the full total. Paid online: nothing to collect.
    booked = await postex.createShipment(order, isCod(order) ? order.totalAmount : 0, user && user.name)
  } catch (err) {
    await Order.updateOne({ _id: orderId }, { $unset: { 'shipment.booking': '' } })
    return reply(502, { message: err.message })
  }

  const now = new Date()
  // Conditional on 'processing': if the customer cancelled while PostEx was booking, undo the parcel.
  const saved = await Order.findOneAndUpdate(
    { _id: orderId, orderStatus: 'processing' },
    {
      $set: {
        orderStatus: 'shipped',
        'shipment.courier': COURIER,
        'shipment.trackingNumber': booked.trackingNumber,
        'shipment.status': 'Booked',
        'shipment.bookedAt': now,
        'shipment.lastCheckedAt': now,
        'shipment.lastResponse': booked.raw,
      },
      $unset: { 'shipment.booking': '' },
    },
    { new: true }
  )
  if (!saved) {
    await Order.updateOne({ _id: orderId }, { $unset: { 'shipment.booking': '' } })
    try { await postex.cancelShipment(booked.trackingNumber) } catch (e) {
      console.error(`PostEx parcel ${booked.trackingNumber} was booked for a cancelled order and could not be cancelled:`, e.message)
    }
    return reply(409, { message: 'The order was cancelled while booking, so the parcel was cancelled too.' })
  }
  return reply(200, saved)
}

const bookShipment = async (req, res) => {
  const r = await bookOrder(req.params.orderId)
  res.status(r.status).json(r.body)
}

// Reads PostEx's status and applies it. "Delivered" -> order delivered, and a COD order paid
// (the rider collected the cash). Returns the fresh order.
const syncShipment = async (order) => {
  const tracked = await postex.trackShipment(order.shipment.trackingNumber)
  const now = new Date()
  await Order.updateOne(
    { _id: order._id },
    { $set: { 'shipment.status': tracked.status, 'shipment.lastCheckedAt': now, 'shipment.lastResponse': tracked.raw } }
  )

  if (postex.isDeliveredStatus(tracked.status) && !['delivered', 'cancelled'].includes(order.orderStatus)) {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        // Conditional, so a timer run and a manual refresh at the same time apply it only once.
        const changed = await Order.findOneAndUpdate(
          { _id: order._id, orderStatus: { $nin: ['delivered', 'cancelled'] } },
          { $set: { orderStatus: 'delivered', deliveryDate: now } },
          { new: true, session }
        )
        if (!changed || !isCod(changed)) return
        await Payment.updateMany(
          { order: order._id, paymentMethod: 'cod', paymentStatus: 'pending' },
          { $set: { paymentStatus: 'completed' } },
          { session }
        )
        await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'paid' } }, { session })
      })
    } finally {
      await session.endSession()
    }
  }
  return Order.findById(order._id)
}

// Refresh one order's tracking now (Admin).
const refreshShipment = async (req, res) => {
  const { orderId } = req.params
  if (!mongoose.isValidObjectId(orderId)) return res.status(404).json({ message: 'Order not found' })
  const order = await Order.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })
  if (!order.shipment || !order.shipment.trackingNumber) {
    return res.status(400).json({ message: 'This order is not booked with a courier yet' })
  }
  try {
    res.status(200).json(await syncShipment(order))
  } catch (err) {
    res.status(502).json({ message: err.message })
  }
}

// Timer job: checks every shipped order. One failure never stops the rest.
const syncAllShipments = async () => {
  const orders = await Order.find({ orderStatus: 'shipped', 'shipment.trackingNumber': { $ne: null } })
    .sort({ 'shipment.lastCheckedAt': 1 })
    .limit(200)
  let delivered = 0
  let failed = 0
  for (const order of orders) {
    try {
      const fresh = await syncShipment(order)
      if (fresh && fresh.orderStatus === 'delivered') delivered++
    } catch (err) {
      failed++
      console.error(`PostEx tracking failed for order ${order._id}:`, err.message)
    }
  }
  return { checked: orders.length, delivered, failed }
}

// Express 4 does not catch errors from async handlers; without this a DB error hangs the request.
const safe = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ message: error.message })
  }
}

module.exports = {
  bookShipment: safe(bookShipment),
  refreshShipment: safe(refreshShipment),
  syncShipment,
  syncAllShipments,
  bookOrder,
  isCod,
}
