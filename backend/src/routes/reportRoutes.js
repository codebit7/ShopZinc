const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken.js')
const verifyRole = require('../middlewares/verifyRole.js')
const { salesReport, orderReceipt } = require('../controllers/reportController.js')

// Admin only: sales / profit figures and cost prices must never reach shoppers.
// verifyRole must come after verifyToken (it reads req.user).
router.get('/sales', verifyToken, verifyRole(['admin']), salesReport)
router.get('/receipt/:orderId', verifyToken, verifyRole(['admin']), orderReceipt)

module.exports = router
