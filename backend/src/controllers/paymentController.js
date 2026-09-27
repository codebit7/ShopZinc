const mongoose = require('mongoose')
const Payment = require('../models/payementModel.js')
const Order = require('../models/orderModel.js')
const User = require('../models/userModel.js')
const { availableMethods, GATEWAY_METHODS } = require('../config/payments.js')

// Public: checkout shows only the methods that are enabled right now.
const getPaymentMethods = (req, res) => {
    res.status(200).json(availableMethods())
}


const createPayment = async (req,res)=>{
    try {
        const { order, paymentMethod, amount } = req.body;
        if(!order ||!paymentMethod || !amount)
        {
            return res.status(400).json({ message: "Please fill all fields" });
        }
           


        const existingOrder = await Order.findById(order).populate('items.product');
    
        if (!existingOrder) {
            return res.status(404).json({ message: "Order not found" });
        }
        // BUG-30: anyone logged in could add a payment to someone else's order. The route is
        // admin-only now, but the check stays so opening the route again cannot reopen the hole.
        if (!existingOrder.user.equals(req.user.id)) {
            const caller = await User.findById(req.user.id).select('role')
            if (!caller || caller.role !== 'admin') {
                return res.status(403).json({ message: "You are not authorized" })
            }
        }

        
        const payment = await Payment.create({
            user:req.user.id,
            order:existingOrder._id,
            paymentMethod,
            amount:existingOrder.totalAmount,
            paymentStatus:'pending'

        })
       
        
        res.status(200).json(payment);

        
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}


const getAllPayments = async (req,res)=>{
    try {

       // Never send the password hash / verify token with the populated user.
       // const payment = await Payment.find().populate({ path: 'user', select: '-password -verifyTokenHash -verifyTokenExpires' }).populate('order')
       // Allowlist, not a blocklist: the blocklist leaked every new secret field (reset token hash,
       // throttle state). Only what the payments page shows.
       const payment = await Payment.find().populate({ path: 'user', select: 'name email' }).populate('order')
       // BUG-23: `!payment.length === 0` was always false, so this guard never ran.
       // if(!payment.length === 0){
       if(payment.length === 0){
        return res.status(404).json({ message: "No payment found" });
       }
       res.status(200).json(payment);

        
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}

const getPaymentsById = async (req,res)=>{
    try {
        const  {id} = req.params
        // BUG-24: the JWT field is `id`, not `userId`, so owners were always refused.
        // const {userId , role} = req.user
        const userId = req.user.id
        // Never send the password hash / verify token with the populated user.
        // const payment = await Payment.findById(id).populate({ path: 'user', select: '-password -verifyTokenHash -verifyTokenExpires' }).populate('order')
        // Allowlist (same reason as getAllPayments). _id is always included, the owner check below needs it.
        const payment = await Payment.findById(id).populate({ path: 'user', select: 'name email' }).populate('order')
        if(!payment)
        {
            return res.status(404).json({ message: "No payment found" });
        }
        // if(role ==='admin' || payment.user.equals(userId))
        // payment.user is populated (and null if the user was deleted), so compare its _id.
        if(payment.user && payment.user._id.equals(userId))
        {
            return res.status(200).json(payment)
        }
        // Role from the DB, not the JWT, like verifyRole: a demoted admin loses access at once.
        const caller = await User.findById(userId).select('role')
        if(caller && caller.role === 'admin')
        {
            return res.status(200).json(payment)
        }
        res.status(403).json({message:"You are not authorized"})
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}
// Old version: any string was accepted and the order's paymentStatus never followed. Kept for reference.
// const updatePaymentStatus = async (req,res)=>{
//     try {
//         const {id} = req.params
//         const {status} = req.body
//         if(!status) return res.status(400).json({message:"please fill the status"})
//         const payment = await Payment.findByIdAndUpdate(id, 
//                 {
//                    paymentStatus: status,
//                 }, 
//                 {new:true})
//         if(!payment){
//             return res.status(404).json({ message: "No payment found" });
//         }
//         res.status(200).json(payment)
//
//     } catch (error) {
//         res.status(500).json({message:error.message})
//     }
// }

// Payment status -> the order's paymentStatus (the two enums use different words).
const ORDER_PAYMENT_STATUS = { pending: 'pending', completed: 'paid', failed: 'failed' }

// Admin marks a payment (e.g. COD cash collected). Payment and order change together in one
// transaction, so the order page and the payments page can never disagree.
const updatePaymentStatus = async (req,res)=>{
    const {id} = req.params
    const status = req.body && req.body.status
    if(!status) return res.status(400).json({message:"please fill the status"})
    if(!Object.prototype.hasOwnProperty.call(ORDER_PAYMENT_STATUS, status)){
        return res.status(400).json({message:"Status must be pending, completed or failed"})
    }
    if(!mongoose.isValidObjectId(id)) return res.status(404).json({ message: "No payment found" });

    const session = await mongoose.startSession()
    try {
        let payment
        let failure
        await session.withTransaction(async () => {
            payment = undefined
            failure = undefined
            const current = await Payment.findById(id).session(session)
            if(!current){
                failure = { status: 404, body: { message: "No payment found" } }
                return
            }
            // Online payments are confirmed by the gateway callback, never by hand, or an admin
            // could mark an unpaid JazzCash order as paid.
            if(GATEWAY_METHODS.includes(current.paymentMethod)){
                failure = { status: 400, body: { message: "Only cash on delivery payments can be updated by hand" } }
                return
            }
            current.paymentStatus = status
            payment = await current.save({ session })
            await Order.updateOne(
                { _id: current.order },
                { $set: { paymentStatus: ORDER_PAYMENT_STATUS[status] } },
                { session }
            )
        })
        if(failure) return res.status(failure.status).json(failure.body)
        // Same shape as before: the updated payment document.
        res.status(200).json(payment)
    } catch (error) {
        res.status(500).json({message:error.message})
    } finally {
        await session.endSession()
    }
}

const deletePayment = async (req,res)=>{
    try {
        
        const {id} = req.params
        const payment = await Payment.findByIdAndDelete(id)
        if(!payment){
            return res.status(404).json({ message: "No payment found" });
        }
        res.status(200).json(payment)

    } catch (error) {
        res.status(500).json({message:error.message})
    }
}



module.exports = {
    getPaymentMethods,
    createPayment,
    getAllPayments,
    getPaymentsById,
    updatePaymentStatus,
    deletePayment
}