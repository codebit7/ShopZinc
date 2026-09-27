const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken.js')
const verifyRole = require('../middlewares/verifyRole.js')
const { getReady, getShipments, bookMany, syncNow, getSettings, updateSettings } = require('../controllers/courierController.js')

// Admin only, all of it: it books parcels (costs money) and changes the delivery fee buyers pay.
router.use(verifyToken, verifyRole(['admin']))

router.get('/ready', getReady)
router.get('/shipments', getShipments)
router.post('/book', bookMany)
router.post('/sync', syncNow)
router.route('/settings').get(getSettings).put(updateSettings)

module.exports = router
