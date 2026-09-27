const mongoose = require('mongoose')

// Small store-wide settings the admin can change, one document per key.
// First use: { key: 'carousel', value: { showAuto: true } }.
const siteSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false })

const SiteSetting = mongoose.model('SiteSetting', siteSettingSchema)
module.exports = SiteSetting
