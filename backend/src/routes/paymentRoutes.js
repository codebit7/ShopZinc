const express = require('express')
const router = express.Router()

const verifyToken = require('../middlewares/verifyToken.js')
const verifyRole = require('../middlewares/verifyRole.js')


const {getPaymentMethods,
     createPayment,
     getAllPayments,
     getPaymentsById,
     updatePaymentStatus,
     deletePayment,
    } = require('../controllers/paymentController.js')
const { initJazzCash, jazzcashReturn } = require('../controllers/jazzcashController.js')



// Public, and BEFORE /:id, or "methods" would be read as a payment id.
router.get('/methods', getPaymentMethods)

// JazzCash. Also before /:id. The return is posted by JazzCash as a form (not JSON) and carries
// no auth cookie, so it has no verifyToken: the signature check in the controller is the auth.
router.post('/jazzcash/init', verifyToken, initJazzCash)
router.post('/jazzcash/return', express.urlencoded({ extended: false }), jazzcashReturn)

// Admin-only now: createOrder makes the COD payment itself, so buyers never need this (BUG-30).
// router.route('/').post(verifyToken,createPayment)
router.route('/').post(verifyToken,verifyRole(['admin']),createPayment)
.get(verifyToken,verifyRole(['admin']),getAllPayments)


router.get('/:id',verifyToken,getPaymentsById)
router.patch('/:id/status',verifyToken,verifyRole(['admin']),updatePaymentStatus)
router.delete('/:id',verifyToken,verifyRole(['admin']),deletePayment)





module.exports = router