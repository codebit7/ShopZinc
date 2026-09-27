const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const Product = require('../models/productModel.js')
const Payment = require('../models/payementModel.js')
const { parseReportQuery, buildSalesReport } = require('../utils/report.js')

// GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month|year&tzOffset=-300
// Admin only. Revenue, profit, orders and growth vs the previous period of the same length.
const salesReport = async (req, res) => {
  try {
    const range = parseReportQuery(req.query)
    if (range.error) return res.status(400).json({ message: range.error })

    // aggregate + $project: only the fields the math needs. Aggregation also returns
    // items.costAtTimeOfOrder, which the schema hides (select:false) from normal finds.
    const orders = await Order.aggregate([
      { $match: { orderDate: { $gte: range.prevStart, $lt: range.end } } },
      {
        $project: {
          orderDate: 1, orderStatus: 1, paymentStatus: 1, totalAmount: 1,
          'items.product': 1, 'items.quantity': 1, 'items.priceAtTimeOfOrder': 1, 'items.costAtTimeOfOrder': 1,
        },
      },
    ])

    // Names only for products that were actually sold in the range.
    const ids = [...new Set(orders.flatMap((o) => (o.items || []).map((it) => String(it.product))))]
      .filter((id) => mongoose.isValidObjectId(id))
    const named = await Product.find({ _id: { $in: ids } }).select('name').lean()
    const names = new Map(named.map((p) => [String(p._id), p.name]))

    res.status(200).json(buildSalesReport(orders, range, names))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// GET /reports/receipt/:orderId — admin only. Everything a printed receipt needs in one call:
// the customer's name/email (the normal order endpoint only has the user id) and the payment.
const orderReceipt = async (req, res) => {
  try {
    const { orderId } = req.params
    if (!mongoose.isValidObjectId(orderId)) return res.status(404).json({ message: 'Order not found' })
    const order = await Order.findById(orderId)
      .populate('user', 'name email')
      .populate('items.product', 'name')
      .lean()
    if (!order) return res.status(404).json({ message: 'Order not found' })
    const payment = await Payment.findOne({ order: order._id })
      .sort({ createdAt: -1 })
      .select('paymentMethod paymentStatus transactionId amount paymentDate')
      .lean()
    res.status(200).json({ ...order, payment: payment || null })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = { salesReport, orderReceipt }
