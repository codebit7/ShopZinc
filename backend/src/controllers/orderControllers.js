
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const User = require('../models/userModel.js')
const Product = require('../models/productModel.js')
// Order details show the payment too, because GET /payments/:id is broken for owners (BUG-24).
const Payment = require('../models/payementModel.js')
// Orders are built from the server cart, never from the request body (BUG-28).
const Cart = require('../models/cartModel.js')
// Shared with the cart, so the price shown in the cart is the price charged here.
const { unitPrice, round2 } = require('../utils/pricing.js')
// Same delivery rule the cart shows, so the buyer is charged what they saw.
const { deliveryFee } = require('../config/shipping.js')
// Why: order lines keep the shopper's choices (Size, Color...) apart.
const { selectionKey } = require('../utils/options.js')
// Same list GET /payments/methods shows, so checkout and createOrder agree on what is allowed.
// const { availableMethods, STORE_CURRENCY } = require('../config/payments.js')
// GATEWAY_METHODS: CancelOrder refuses to self-cancel an order already paid online (no refund API).
const { availableMethods, STORE_CURRENCY, GATEWAY_METHODS } = require('../config/payments.js')
// Same phone rule the courier uses, so an order that passes here can always be booked.
const { normalizePhone, cancelShipment } = require('../utils/postex.js')

// Only the fields the account pages show; the full product doc (ratings etc.) is wasted bytes.
const ITEM_PRODUCT_FIELDS = 'name images price'

// Create a new order (Customer)

// A business rule failure inside the transaction. Throwing it makes withTransaction abort
// (undoing any stock already taken); the handler then sends its status + body.
class OrderError extends Error {
  constructor(status, body) {
    super(body.message)
    this.status = status
    this.body = body
  }
}

const isFilled = (v) => typeof v === 'string' && v.trim() !== ''

// Returns { address } (trimmed) or { error }. street, city, country are needed to ship at all.
// requirePhone: new orders must have one (the courier needs it); admin edits of older orders may not.
const validateAddress = (address, { requirePhone = false } = {}) => {
  if (!address || typeof address !== 'object') {
    return { error: 'Please add a shipping address' }
  }
  for (const field of ['street', 'city', 'country']) {
    if (!isFilled(address[field])) {
      return { error: `Please add the ${field} of your address` }
    }
  }
  const clean = {}
  for (const field of ['street', 'city', 'state', 'postalCode', 'country']) {
    // Optional fields may be missing; only strings are kept so no objects sneak into the doc.
    if (typeof address[field] === 'string') clean[field] = address[field].trim()
  }
  const hasPhone = typeof address.phone === 'string' && address.phone.trim() !== ''
  if (hasPhone || requirePhone) {
    const phone = normalizePhone(address.phone)
    if (!phone) return { error: 'Please add a valid mobile number, like 03001234567' }
    clean.phone = phone
  }
  return { address: clean }
}

// cartItems: the cart's items with `product` populated.
// Returns { lines, total } or { error, status, productId? }. Pure: no DB, so it can be tested.
const buildOrderLines = (cartItems) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { status: 400, error: 'Your cart is empty' }
  }
  // Same product twice in the cart (possible because of BUG-12) becomes one line, so the stock
  // check sees the full quantity at once and the "only N left" number is right.
  // With choices, Size M and Size L stay separate lines (the key includes the pick); each line's
  // conditional stock decrement still runs against the one shared product stock.
  const byId = new Map()
  for (const item of cartItems) {
    if (!item || !item.product) {
      // populate() gives null when the product was deleted after it was carted.
      return { status: 409, error: 'An item in your cart is no longer available' }
    }
    const qty = Number(item.quantity)
    if (!Number.isInteger(qty) || qty < 1) {
      return { status: 400, error: `${item.product.name} has an invalid quantity`, productId: String(item.product._id) }
    }
    // const key = String(item.product._id)
    const selected = (item.selected || []).map((s) => ({ name: s.name, value: s.value }))
    const key = `${item.product._id}#${selectionKey(selected)}`
    const line = byId.get(key)
    // costAtTimeOfOrder: null when no cost price is set, so reports can tell "unknown" from 0.
    const cost = typeof item.product.costPrice === 'number' ? item.product.costPrice : null
    if (line) line.quantity += qty
    else byId.set(key, { product: item.product._id, name: item.product.name, quantity: qty, priceAtTimeOfOrder: unitPrice(item.product, selected), costAtTimeOfOrder: cost, selected })
  }
  const lines = [...byId.values()]
  const total = round2(lines.reduce((sum, l) => sum + l.priceAtTimeOfOrder * l.quantity, 0))
  return { lines, total }
}

// Returns { method } or { error }. Missing method means 'cod', so older clients keep working.
// methods: the availableMethods() list. Pure: no DB, so it can be tested.
const resolvePaymentMethod = (body, methods) => {
  const raw = body ? body.paymentMethod : undefined
  const id = raw === undefined || raw === null || raw === '' ? 'cod' : raw
  const found = typeof id === 'string' && methods.find((m) => m.id === id)
  // Unknown and disabled get the same answer: a disabled gateway is not half-usable.
  if (!found || !found.enabled) return { error: 'This payment method is not available' }
  return { method: found.id }
}

const createOrder = async (req, res) => {
  const { id } = req.user
  // Only the address is read from the body. items / totalAmount / paymentStatus are ignored on
  // purpose: a buyer could send a $0.01 total marked "paid" (BUG-28).
  // const checked = validateAddress(req.body && req.body.address)
  const checked = validateAddress(req.body && req.body.address, { requirePhone: true })
  if (checked.error) return res.status(400).json({ message: checked.error })
  // Checked before the transaction, so a bad method never touches stock.
  const pay = resolvePaymentMethod(req.body, availableMethods())
  if (pay.error) return res.status(400).json({ message: pay.error })

  const session = await mongoose.startSession()
  try {
    let orderId
    // One transaction: if any line is short of stock, nothing is decremented, no order is made
    // and the cart is untouched (BUG-29: stock was never decremented, so overselling was certain).
    await session.withTransaction(async () => {
      // withTransaction can retry this callback, so everything is rebuilt from scratch each time.
      orderId = undefined
      // const cart = await Cart.findOne({ user: id }).populate('items.product').session(session)
      // +costPrice: it is select:false on the product, and the order line must record it.
      const cart = await Cart.findOne({ user: id }).populate({ path: 'items.product', select: '+costPrice' }).session(session)
      const built = buildOrderLines(cart ? cart.items : [])
      if (built.error) {
        const body = { message: built.error }
        if (built.productId) body.productId = built.productId
        throw new OrderError(built.status, body)
      }

      for (const line of built.lines) {
        // Conditional decrement: only succeeds when enough stock is left, so two buyers
        // racing for the last unit cannot both get it.
        const result = await Product.updateOne(
          { _id: line.product, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
          { session }
        )
        if (result.modifiedCount === 0) {
          const current = await Product.findById(line.product).select('name stock').session(session)
          const message = current
            ? `${current.name} has only ${Math.max(current.stock, 0)} left`
            : `${line.name} is no longer available`
          throw new OrderError(409, { message, productId: String(line.product) })
        }
      }

      // Fee from the server's items total, never from the request body.
      const shippingFee = deliveryFee(built.total)
      const [order] = await Order.create([{
        user: id,
        // items: built.lines.map(({ product, quantity, priceAtTimeOfOrder }) => ({ product, quantity, priceAtTimeOfOrder })),
        // items: built.lines.map(({ product, quantity, priceAtTimeOfOrder, selected }) => ({ product, quantity, priceAtTimeOfOrder, selected })),
        items: built.lines.map(({ product, quantity, priceAtTimeOfOrder, costAtTimeOfOrder, selected }) => ({ product, quantity, priceAtTimeOfOrder, costAtTimeOfOrder, selected })),
        shippingAddress: checked.address,
        paymentStatus: 'pending',
        paymentMethod: pay.method,
        // totalAmount: built.total,
        shippingFee,
        totalAmount: round2(built.total + shippingFee),
      }], { session })

      if (pay.method === 'cod') {
        // Same transaction: an order never exists without its payment record. The admin marks
        // it completed when the cash is collected. Gateway methods will create theirs later.
        await Payment.create([{
          user: id,
          order: order._id,
          paymentMethod: 'cod',
          paymentStatus: 'pending',
          amount: order.totalAmount,
          currency: STORE_CURRENCY,
        }], { session })
      }

      await User.updateOne({ _id: id }, { $push: { orderHistory: order._id } }, { session })
      // The cart is emptied in the same transaction, so a failed order never loses the cart.
      await Cart.updateOne({ _id: cart._id }, { $set: { items: [], total: 0 } }, { session })
      orderId = order._id
    })

    // Same product fields as getAOrder, so the confirmation page can show names and images.
    const order = await Order.findById(orderId).populate('items.product', ITEM_PRODUCT_FIELDS)
    res.status(201).json({ order })
  } catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json(error.body)
    res.status(500).json({ message: error.message })
  } finally {
    await session.endSession()
  }
}

// Old version: trusted items, totalAmount and paymentStatus from the body (BUG-28) and never
// touched stock (BUG-29). Kept for reference.
// const createOrder = async(req,res)=>{
//      try {
//        const {id} =  req.user
//        const {items,address, paymentStatus ='pending', totalAmount} = req.body

//        if(!items || !address  || !totalAmount)
//        {
//         return res.status(400).json({message: 'Please fill all the fields'})
//        }

//        for (const item of items) {
//          const product = await Product.findById(item.product); 
//          if (!product) {
//              return res.status(404).json({ message: `Product not found for ID: ${item.product}` });
//          }
//      }
//       const order = await Order.create({
//         user:id,
//         items:items,
//         shippingAddress:address,
//         paymentStatus:paymentStatus,
//         totalAmount:totalAmount
//        })
       
//     //    const user = await User.findById(id);
//     //    user.orderHistory.push(order._id);


//         await User.findByIdAndUpdate(id,
//         { $push: { orderHistory: order._id } },
//          {new: true})
//        res.status(201).json(order)
       
//      } catch (error) {
//         res.status(500).json({message:error.message});
//      }
// }


//Get all orders (Admin)

const getAllOrders = async(req,res)=>{
    try {
      const orders = await Order.find().populate('items.product')
      if(!orders|| orders.length === 0){
        return res.status(404).json({message: 'No orders found'})
      }
      res.status(200).json(orders)
    } catch (error) {
       res.status(500).json({message:error.message});
    }
}

// Get details of a specific order by ID (Customer, Admin)
const getAOrder =async (req,res)=>{
    try {
    //    const {id} = req.user
       // BUG-09: the route is /:orderId, so req.params.id was always undefined -> always 404.
       // const orderId = req.params.id
       const orderId = req.params.orderId
       // const order =await Order.findById(orderId).populate('items.product')
       const order = await Order.findById(orderId).populate('items.product', ITEM_PRODUCT_FIELDS)
       if(!order){
        return res.status(404).json({message: 'Order not found'})
       }
       const payment = await Payment.findOne({ order: order._id })
         .sort({ createdAt: -1 })
         .select('paymentMethod paymentStatus transactionId amount paymentDate')
       // Same order shape as before, plus `payment` (null when none recorded).
       res.status(200).json({ ...order.toObject(), payment: payment || null })
    } catch (error) {
       res.status(500).json({message:error.message});
    }
}


// Get all orders of a specific user (Customer for their own orders, Admin for any user)
const getAllOrdersOfUser = async(req,res)=>{
    try {
       // BUG-10: this called order.user.equals() on an ARRAY (always 500) and queried before
       // checking access. Now: authorise first, then query.
       // const {id, role} = req.user
       // const userId = req.params.userId
       // const order= await Order.find({user:userId}).populate('items.product')
       // if(order.user.equals(id) || role ==='admin'){
       //  res.status(200).json(order)
       // }
       // else{
       //  return res.status(403).json({message: 'You are not authorized to view this order'})
       // }
       const { id } = req.user
       const userId = req.params.userId || id  // /orders/me has no :userId -> the caller
       if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: 'Invalid user id' })
       }
       if (String(userId) !== String(id)) {
        // Role from the DB, not the JWT, like verifyRole: a demoted admin loses access at once.
        const caller = await User.findById(id).select('role')
        if (!caller || caller.role !== 'admin') {
         return res.status(403).json({message: 'You are not authorized to view these orders'})
        }
       }
       const orders = await Order.find({ user: userId })
         .sort({ createdAt: -1 })
         .populate('items.product', ITEM_PRODUCT_FIELDS)
       // Empty is not an error: 200 with [] so the page can show its empty state.
       res.status(200).json(orders)
    } catch (error) {
       res.status(500).json({message:error.message});
    }
}

// Gives an order's stock back. Shared by cancel, status change and delete, so all three restore
// stock the same way. Must run inside the caller's transaction (session).
const restoreStock = async (order, session) => {
    for (const item of order.items) {
        // A product deleted since then matches nothing; fine, there is no stock to restore.
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session })
    }
}

// The only fields PUT /orders/:orderId may change. None of them touch money, stock, owner, items
// or payment. Without this list an admin request could rewrite totalAmount, items or paymentStatus.
// Status goes through PATCH /:orderId/status, which also handles stock.
const ADMIN_EDITABLE_FIELDS = ['shippingAddress', 'deliveryDate']

//Update a specific order (Admin)
const updateAOrder = async(req,res)=>{
    try {
       const orderId  = req.params.orderId
       // A bad id would throw a CastError (500); it is simply "not found".
       if (!mongoose.isValidObjectId(orderId)) return res.status(404).json({message:"Orders not found"});
       const body = req.body && typeof req.body === 'object' ? req.body : {}
       const blocked = Object.keys(body).filter((k) => !ADMIN_EDITABLE_FIELDS.includes(k))
       if (blocked.length) {
        return res.status(400).json({message:`These fields cannot be changed here: ${blocked.join(', ')}. Use /status to change the order status.`})
       }
       const $set = {}
       const $unset = {}
       if (body.shippingAddress !== undefined) {
        // Same rules as checkout, so an edit cannot leave an order with no street/city/country.
        const checked = validateAddress(body.shippingAddress)
        if (checked.error) return res.status(400).json({ message: checked.error })
        $set.shippingAddress = checked.address
       }
       if (body.deliveryDate !== undefined) {
        if (body.deliveryDate === null || body.deliveryDate === '') {
         $unset.deliveryDate = ''
        } else {
         const date = new Date(body.deliveryDate)
         if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'Invalid delivery date' })
         $set.deliveryDate = date
        }
       }
       const update = {}
       if (Object.keys($set).length) update.$set = $set
       if (Object.keys($unset).length) update.$unset = $unset
       if (!Object.keys(update).length) return res.status(400).json({message:"Nothing to update"})

       // const order = await Order.findByIdAndUpdate(orderId, req.body, {new: true})
       const order = await Order.findByIdAndUpdate(orderId, update, {new: true, runValidators: true})
       if(!order) return res.status(404).json({message:"Orders not found"});
       res.status(200).json(order);

    } catch (error) {
       res.status(500).json({message:error.message});
    }
}

// Old version: any string was saved as the status (no validators), and cancelling here never gave
// stock back, unlike CancelOrder. Kept for reference.
// const updateStatus =async (req,res)=>{
//     try {
//        const orderId  = req.params.orderId
//        const {status} = req.body
//        if(!status) return res.status(400).json({message:"please fill the fields"})
//       const order = await Order.findByIdAndUpdate(orderId, {
//         $set :{orderStatus: status}
//        },
//        {
//         new:true
//        }
//     )
//     if(!order) return res.status(404).json({message:"order not found"})
//     res.status(200).json(order);
//     } catch (error) {
//        res.status(500).json({message:error.message});
//     }
// }

//Update the status of an order (Admin)
// Status and stock change in one transaction: moving to 'cancelled' gives stock back exactly once.
const updateStatus =async (req,res)=>{
    const orderId  = req.params.orderId
    const status = req.body && req.body.status
    if(!status) return res.status(400).json({message:"please fill the fields"})
    // Read from the model, so this list can never drift from the schema enum.
    const allowed = Order.schema.path('orderStatus').enumValues
    if(!allowed.includes(status)) {
        return res.status(400).json({message:`Status must be one of: ${allowed.join(', ')}`})
    }
    if(!mongoose.isValidObjectId(orderId)) return res.status(404).json({message:"order not found"})

    // A booked parcel must be cancelled at the courier first, or the rider still delivers an
    // order we have cancelled (and restocked). Done before the transaction: it is a network call.
    if(status === 'cancelled') {
        const booked = await Order.findById(orderId).select('orderStatus shipment')
        if(booked && booked.orderStatus !== 'cancelled' && booked.shipment && booked.shipment.trackingNumber) {
            try {
                await cancelShipment(booked.shipment.trackingNumber)
            } catch (err) {
                return res.status(502).json({message:`Could not cancel the courier booking, so the order was not cancelled. ${err.message}`})
            }
        }
    }

    const session = await mongoose.startSession()
    try {
        let updatedOrder
        let failure
        await session.withTransaction(async () => {
            updatedOrder = undefined
            failure = undefined
            const current = await Order.findById(orderId).session(session)
            if(!current) {
                failure = { status: 404, body: { message: "order not found" } }
                return
            }
            // Same status: nothing to do, and no stock is restored twice.
            if(current.orderStatus === status) {
                updatedOrder = current
                return
            }
            // Its stock was already given back; reopening would sell stock the order no longer holds.
            if(current.orderStatus === 'cancelled') {
                failure = { status: 400, body: { message: "cancelled orders cannot be reopened" } }
                return
            }
            // Conditional on the status we just read: if CancelOrder (or another admin) changed it
            // meanwhile, this matches nothing, so stock can never be restored twice.
            const order = await Order.findOneAndUpdate(
                { _id: orderId, orderStatus: current.orderStatus },
                { $set: { orderStatus: status } },
                { new: true, runValidators: true, session }
            )
            if(!order) {
                failure = { status: 409, body: { message: "The order changed at the same time, please reload" } }
                return
            }
            if(status === 'cancelled') await restoreStock(order, session)
            updatedOrder = order
        })
        if(failure) return res.status(failure.status).json(failure.body)
        res.status(200).json(updatedOrder);
    } catch (error) {
       res.status(500).json({message:error.message});
    } finally {
        await session.endSession()
    }
}


//Delete a specific order (Admin)

// Old version: pop() ignores its argument, so it removed the user's LAST order, not this one
// (BUG-21); it crashed if the user was deleted, never awaited save(), never gave stock back and
// left the order's payment rows behind. Kept for reference.
// const deleteAOrder = async(req,res)=>{
//     try {
//       const order = await Order.findByIdAndDelete(req.params.orderId)
//       if(!order) return res.status(404).json({message:"orders not found"})
//     // orderId will be delete in orderHistory array in User
//      const user =  await User.findById(order.user);
//      user.orderHistory.pop(order._id)
//      user.save();
//       res.status(200).json({message:"order is successfully deleted"})
//     } catch (error) {
//        res.status(500).json({message:error.message});
//     }
// }

// Order, its stock, the user's orderHistory link and its payments change in one transaction, so a
// failure half way never leaves stock lost or a payment pointing at a missing order.
const deleteAOrder = async(req,res)=>{
    if(!mongoose.isValidObjectId(req.params.orderId)) return res.status(404).json({message:"orders not found"})
    const session = await mongoose.startSession()
    try {
      let found
      await session.withTransaction(async () => {
        found = false
        const order = await Order.findOneAndDelete({ _id: req.params.orderId }, { session })
        if(!order) return
        found = true
        // A cancelled order already gave its stock back; doing it again would invent stock.
        if(order.orderStatus !== 'cancelled') await restoreStock(order, session)
        // $pull removes exactly this id; updateOne matches nothing (no crash) if the user is gone.
        await User.updateOne({ _id: order.user }, { $pull: { orderHistory: order._id } }, { session })
        await Payment.deleteMany({ order: order._id }, { session })
      })
      if(!found) return res.status(404).json({message:"orders not found"})
      res.status(200).json({message:"order is successfully deleted"})
    } catch (error) {
       res.status(500).json({message:error.message});
    } finally {
        await session.endSession()
    }
}




//Cancel an order (Customer)
// Creating an order now takes stock (BUG-29), so cancelling must give it back. Status change and
// stock restore are one transaction: never "cancelled" without the stock returned, or twice.
const CancelOrder = async(req,res)=>{
    const session = await mongoose.startSession()
    try {
        let updatedOrder
        let failure
        await session.withTransaction(async () => {
            updatedOrder = undefined
            failure = undefined
            // Conditional on 'processing': two cancel clicks at once cannot restore stock twice.
            // const order = await Order.findOneAndUpdate(
            //     { _id: req.params.orderId, orderStatus: 'processing' },
            //     { $set: { orderStatus: 'cancelled' } },
            //     { new: true, session }
            // )
            // Also not when paid online: JazzCash has no refund API, so a self-cancel would keep the
            // buyer's money. The store cancels it (admin status change) and refunds by hand.
            // $nin also matches a missing paymentMethod (old orders = cod).
            const order = await Order.findOneAndUpdate(
                {
                    _id: req.params.orderId,
                    orderStatus: 'processing',
                    $or: [{ paymentStatus: { $ne: 'paid' } }, { paymentMethod: { $nin: GATEWAY_METHODS } }],
                },
                { $set: { orderStatus: 'cancelled' } },
                { new: true, session }
            )
            if (!order) {
                // const exists = await Order.exists({ _id: req.params.orderId }).session(session)
                // failure = exists
                //     ? { status: 400, body: { message: "Cannot cancel an order that has already been shipped or delivered" } }
                //     : { status: 404, body: { message: 'Order not found' } }
                // Read the order to pick the right message (paid online vs shipped vs missing).
                const existing = await Order.findById(req.params.orderId)
                    .select('orderStatus paymentStatus paymentMethod').session(session)
                if (!existing) {
                    failure = { status: 404, body: { message: 'Order not found' } }
                } else if (existing.orderStatus === 'processing' && existing.paymentStatus === 'paid'
                    && GATEWAY_METHODS.includes(existing.paymentMethod)) {
                    failure = { status: 400, body: { message: "This order is already paid online. Please contact us to cancel it and get a refund." } }
                } else {
                    failure = { status: 400, body: { message: "Cannot cancel an order that has already been shipped or delivered" } }
                }
                return
            }
            // for (const item of order.items) {
            //     await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session })
            // }
            // Shared helper, so cancel, admin status change and delete restore stock the same way.
            await restoreStock(order, session)
            updatedOrder = order
        })
        if (failure) return res.status(failure.status).json(failure.body)
        // Same shape as before: the updated order document.
        res.status(200).json(updatedOrder)
    } catch (error) {
       res.status(500).json({message:error.message});
    } finally {
        await session.endSession()
    }
}

// Old version: only flipped the status, never returned stock. Kept for reference.
// const CancelOrder = async(req,res)=>{
//     try {
//         const order = await Order.findById(req.params.orderId);
//         if (!order) return res.status(404).json({ message: 'Order not found' });

//         if(order.orderStatus ==='processing')
//         {
//             order.orderStatus = 'cancelled'
//             const updatedOrder = await order.save()
//             res.status(200).json(updatedOrder)
//         }
//         else{
//             res.status(400).json({message:"Cannot cancel an order that has already been shipped or delivered"})
//         }
//     } catch (error) {
//        res.status(500).json({message:error.message});
//     }
// }

module.exports ={
    createOrder,
    getAllOrders,
    getAOrder,
    getAllOrdersOfUser,
    updateAOrder,
    updateStatus,
    deleteAOrder,
    CancelOrder,
    // Pure helpers, exported so they can be checked without a database.
    validateAddress,
    buildOrderLines,
    resolvePaymentMethod,
    // Shared with the JazzCash expiry job.
    restoreStock
}