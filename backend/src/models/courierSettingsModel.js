const mongoose = require('mongoose')

// Courier + delivery settings edited from the admin Courier page. One document only (key 'main').
// A missing field means "use the .env default" (see config/courierSettings.js).
// The PostEx token is NOT stored here on purpose: a DB dump or admin XSS must not leak it.
const courierSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  shippingFee: { type: Number, min: 0 },
  freeShippingMin: { type: Number, min: 0 },
  pickupAddressCode: { type: String, trim: true, maxlength: 50 },
  syncMinutes: { type: Number, min: 0 },
}, { timestamps: true })

// No leaking global (see CLAUDE.md §5): new models follow refreshTokenModel.js.
const CourierSettings = mongoose.model('CourierSettings', courierSettingsSchema)
module.exports = CourierSettings
