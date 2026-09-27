// Admin-edited courier settings, cached in memory. Why a cache: the delivery fee is read on every
// cart response and must stay a plain sync call. The cache is filled at startup and after each save.
// Limit: with several server processes, a save only refreshes the process that handled it.
const CourierSettings = require('../models/courierSettingsModel.js')

const FIELDS = ['shippingFee', 'freeShippingMin', 'pickupAddressCode', 'syncMinutes']
let cache = {}

// Only the admin-set values; callers fall back to .env for anything missing.
const getCourierSettings = () => cache

const loadCourierSettings = async () => {
  const doc = await CourierSettings.findOne({ key: 'main' }).lean()
  cache = {}
  if (doc) for (const f of FIELDS) if (doc[f] !== undefined && doc[f] !== null && doc[f] !== '') cache[f] = doc[f]
  return cache
}

// values: already validated. null/'' clears a field (back to the .env default).
const saveCourierSettings = async (values) => {
  const $set = {}
  const $unset = {}
  for (const f of FIELDS) {
    if (!(f in values)) continue
    if (values[f] === null || values[f] === '') $unset[f] = ''
    else $set[f] = values[f]
  }
  const update = {}
  if (Object.keys($set).length) update.$set = $set
  if (Object.keys($unset).length) update.$unset = $unset
  if (Object.keys(update).length) {
    await CourierSettings.updateOne({ key: 'main' }, update, { upsert: true, runValidators: true })
  }
  return loadCourierSettings()
}

module.exports = { getCourierSettings, loadCourierSettings, saveCourierSettings }
