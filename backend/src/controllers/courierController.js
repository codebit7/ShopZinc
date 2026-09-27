// Admin Courier page: orders ready to ship, booked shipments, and courier settings.
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const postex = require('../utils/postex.js')
const { bookOrder, syncAllShipments, isCod } = require('./shipmentController.js')
const { getCourierSettings, saveCourierSettings } = require('../config/courierSettings.js')
const { shippingRule } = require('../config/shipping.js')

// Only what the page shows; lastResponse/booking stay hidden (select:false on the model).
const LIST_FIELDS = 'user items.quantity shippingAddress paymentMethod paymentStatus orderStatus totalAmount shippingFee orderDate createdAt shipment'
const MAX_ROWS = 300
const MAX_BATCH = 50

// Why an order cannot be booked yet, or null when it can. Same rules as bookOrder.
const blockedReason = (o) => {
  const a = o.shippingAddress || {}
  if (!a.phone) return 'No phone number'
  if (!a.city) return 'No city'
  if (!isCod(o) && o.paymentStatus !== 'paid') return 'Waiting for online payment'
  return null
}

// GET /courier/ready — processing orders not booked yet, oldest first, each with `blocked`
// (null = can be booked now) so the admin also sees what needs fixing.
const getReady = async (req, res) => {
  try {
    const orders = await Order.find({ orderStatus: 'processing', 'shipment.trackingNumber': null })
      .select(LIST_FIELDS)
      .populate('user', 'name email')
      .sort({ createdAt: 1 })
      .limit(MAX_ROWS)
      .lean()
    res.status(200).json(orders.map((o) => ({ ...o, blocked: blockedReason(o) })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// GET /courier/shipments?status=shipped|delivered|cancelled — booked parcels, newest first.
const getShipments = async (req, res) => {
  try {
    const filter = { 'shipment.trackingNumber': { $ne: null } }
    const allowed = ['shipped', 'delivered', 'cancelled']
    if (allowed.includes(req.query.status)) filter.orderStatus = req.query.status
    const orders = await Order.find(filter)
      .select(LIST_FIELDS)
      .populate('user', 'name email')
      .sort({ 'shipment.bookedAt': -1 })
      .limit(MAX_ROWS)
      .lean()
    res.status(200).json(orders)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// POST /courier/book  body { orderIds: [...] } — books each order in turn. One failure does not
// stop the rest; every order gets its own result so the page can show what worked.
const bookMany = async (req, res) => {
  const ids = req.body && Array.isArray(req.body.orderIds) ? [...new Set(req.body.orderIds.map(String))] : []
  if (!ids.length) return res.status(400).json({ message: 'Choose at least one order' })
  if (ids.length > MAX_BATCH) return res.status(400).json({ message: `Book at most ${MAX_BATCH} orders at a time` })
  if (!postex.isConfigured()) return res.status(400).json({ message: 'PostEx is not set up yet (POSTEX_TOKEN is empty)' })
  const results = []
  // One by one, not in parallel: PostEx may rate-limit, and order matters for the admin's list.
  for (const id of ids) {
    try {
      const r = await bookOrder(id)
      results.push(r.status === 200
        ? { orderId: id, ok: true, trackingNumber: r.body.shipment && r.body.shipment.trackingNumber }
        : { orderId: id, ok: false, message: r.body.message })
    } catch (err) {
      results.push({ orderId: id, ok: false, message: err.message })
    }
  }
  res.status(200).json({ results })
}

// POST /courier/sync — check every shipped parcel with PostEx now.
const syncNow = async (req, res) => {
  if (!postex.isConfigured()) return res.status(400).json({ message: 'PostEx is not set up yet (POSTEX_TOKEN is empty)' })
  try {
    res.status(200).json(await syncAllShipments())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// What the settings form shows: the admin-set values, what is in effect now, and PostEx status.
const settingsView = () => {
  const saved = getCourierSettings()
  const rule = shippingRule()
  const envSync = Number(process.env.POSTEX_SYNC_MINUTES)
  return {
    saved,
    effective: {
      shippingFee: rule.fee,
      freeShippingMin: rule.freeFrom,
      pickupAddressCode: saved.pickupAddressCode || process.env.POSTEX_PICKUP_ADDRESS_CODE || '',
      syncMinutes: typeof saved.syncMinutes === 'number' ? saved.syncMinutes : (Number.isFinite(envSync) && envSync >= 0 && process.env.POSTEX_SYNC_MINUTES.trim() !== '' ? envSync : 180),
    },
    // Only a yes/no: the token itself never leaves the server.
    postexConfigured: postex.isConfigured(),
  }
}

const getSettings = (req, res) => res.status(200).json(settingsView())

// PUT /courier/settings — each field: a value, or null/'' to go back to the .env default.
const updateSettings = async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const values = {}
  const money = (key, label) => {
    if (!(key in body)) return null
    const v = body[key]
    if (v === null || v === '') { values[key] = null; return null }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 1000000) return `${label} must be a number from 0 to 1,000,000`
    values[key] = Math.round(n)
    return null
  }
  const errors = [money('shippingFee', 'Delivery fee'), money('freeShippingMin', 'Free delivery amount')]
  if ('syncMinutes' in body) {
    const v = body.syncMinutes
    if (v === null || v === '') values.syncMinutes = null
    else {
      const n = Number(v)
      // Under 5 minutes would hammer PostEx for little gain; 0 turns the auto-check off.
      if (!Number.isInteger(n) || (n !== 0 && (n < 5 || n > 1440))) errors.push('Auto-check must be 0 (off) or 5 to 1440 minutes')
      else values.syncMinutes = n
    }
  }
  if ('pickupAddressCode' in body) {
    const v = body.pickupAddressCode
    if (v === null || v === '') values.pickupAddressCode = null
    else if (typeof v !== 'string' || v.trim().length > 50) errors.push('Pickup address code must be text, at most 50 characters')
    else values.pickupAddressCode = v.trim()
  }
  const firstError = errors.find(Boolean)
  if (firstError) return res.status(400).json({ message: firstError })
  try {
    await saveCourierSettings(values)
    res.status(200).json(settingsView())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = { getReady, getShipments, bookMany, syncNow, getSettings, updateSettings, blockedReason }
