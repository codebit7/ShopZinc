const fs = require('fs')
const mongoose = require('mongoose')
const cloudinary = require('cloudinary').v2
const Slide = require('../models/slideModel.js')
const SiteSetting = require('../models/siteSettingModel.js')
const Product = require('../models/productModel.js')
const Category = require('../models/categoryModel.js')
const uploadCloudinary = require('../utils/cloudinary.js')

// Home-page carousel managed by the admin.
//   Public:  GET /carousel            -> live slides (active + inside their dates) + showAuto
//   Admin:   everything else          -> all slides, create/edit/delete, reorder, settings

const SETTING_KEY = 'carousel'
const DEFAULT_SETTINGS = { showAuto: true }

// Multipart sends everything as strings; this turns the form into clean slide fields.
// Pure (no DB), so it can be checked without Mongo. Returns { fields } or { error }.
// partial = an edit: fields not sent stay unchanged.
function checkSlide(body = {}, { partial = false } = {}) {
  const f = {}
  const str = (k, max, label) => {
    if (body[k] === undefined) return null
    const v = String(body[k]).trim()
    if (v.length > max) return `${label} must be ${max} characters or less`
    f[k] = v
    return null
  }
  let err = str('title', 80, 'Title') || str('subtitle', 200, 'Text') || str('eyebrow', 40, 'Small heading') || str('buttonText', 24, 'Button text')
  if (err) return { error: err }
  if (!partial && !f.title) return { error: 'Please add a title' }
  if (partial && body.title !== undefined && !f.title) return { error: 'Title cannot be empty' }

  if (body.linkType !== undefined || body.linkValue !== undefined) {
    const type = body.linkType === undefined ? 'none' : String(body.linkType)
    const value = body.linkValue === undefined ? '' : String(body.linkValue).trim()
    if (!['product', 'category', 'url', 'none'].includes(type)) return { error: 'Unknown link type' }
    if ((type === 'product' || type === 'category') && !mongoose.isValidObjectId(value)) {
      return { error: `Please choose a ${type}` }
    }
    // A page inside the store ("/filter?...") or a full web address. Anything else (javascript:,
    // relative junk) is refused so a slide button can never run script.
    if (type === 'url' && !/^\/(?!\/)\S*$/.test(value) && !/^https?:\/\/\S+$/i.test(value)) {
      return { error: 'Link must start with / (a store page) or https://' }
    }
    f.link = { type, value: type === 'none' ? '' : value }
  }

  if (body.active !== undefined) f.active = body.active === true || body.active === 'true'

  for (const k of ['startsAt', 'endsAt']) {
    if (body[k] === undefined) continue
    if (body[k] === '' || body[k] === null || body[k] === 'null') { f[k] = null; continue }
    const d = new Date(body[k])
    if (isNaN(d)) return { error: 'Please use a valid date' }
    f[k] = d
  }
  if (f.startsAt && f.endsAt && f.endsAt <= f.startsAt) return { error: 'End date must be after the start date' }
  return { fields: f }
}

// Where the slide button goes, as a store URL.
const hrefOf = (link) => {
  if (!link || link.type === 'none' || !link.value) return null
  if (link.type === 'product') return `/product/${link.value}`
  if (link.type === 'category') return `/filter?category=${link.value}`
  return link.value
}

// Is it on the store right now?
const isLive = (s, now = new Date()) =>
  s.active && (!s.startsAt || s.startsAt <= now) && (!s.endsAt || s.endsAt > now)

async function getSettings() {
  const doc = await SiteSetting.findOne({ key: SETTING_KEY }).lean()
  return { ...DEFAULT_SETTINGS, ...(doc ? doc.value : {}) }
}

// A product/category link must point at something that exists.
async function linkExists(link) {
  if (!link) return true
  if (link.type === 'product') return Boolean(await Product.exists({ _id: link.value }))
  if (link.type === 'category') return Boolean(await Category.exists({ _id: link.value }))
  return true
}

const removeTemp = (file) => { if (file) fs.unlink(file.path, () => {}) }

// ---------- public ----------
const getLiveCarousel = async (req, res) => {
  try {
    const now = new Date()
    const [slides, settings] = await Promise.all([
      Slide.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean(),
      getSettings(),
    ])
    res.status(200).json({
      showAuto: settings.showAuto,
      slides: slides.filter((s) => isLive(s, now)).map((s) => ({
        _id: s._id, title: s.title, subtitle: s.subtitle, eyebrow: s.eyebrow,
        image: s.image, buttonText: s.buttonText, href: hrefOf(s.link),
      })),
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ---------- admin ----------
const getAllSlides = async (req, res) => {
  try {
    const now = new Date()
    const [slides, settings] = await Promise.all([Slide.find().sort({ order: 1, createdAt: 1 }).lean(), getSettings()])
    res.status(200).json({ settings, slides: slides.map((s) => ({ ...s, href: hrefOf(s.link), live: isLive(s, now) })) })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

const createSlide = async (req, res) => {
  try {
    const checked = checkSlide(req.body)
    if (checked.error) { removeTemp(req.file); return res.status(400).json({ message: checked.error }) }
    if (!req.file) return res.status(400).json({ message: 'Please add an image' })
    if (!(await linkExists(checked.fields.link))) { removeTemp(req.file); return res.status(400).json({ message: 'The linked product or category no longer exists' }) }

    const uploaded = await uploadCloudinary(req.file.path) // deletes the temp file either way
    if (!uploaded) return res.status(500).json({ message: 'Image upload failed' })

    const last = await Slide.findOne().sort({ order: -1 }).select('order').lean()
    const slide = await Slide.create({
      ...checked.fields,
      image: { url: uploaded.secure_url, imageId: uploaded.public_id },
      order: last ? last.order + 1 : 0,
    })
    res.status(201).json({ message: 'Slide added', slide })
  } catch (error) {
    removeTemp(req.file)
    res.status(500).json({ message: error.message })
  }
}

const updateSlide = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { removeTemp(req.file); return res.status(404).json({ message: 'Slide not found' }) }
    const checked = checkSlide(req.body, { partial: true })
    if (checked.error) { removeTemp(req.file); return res.status(400).json({ message: checked.error }) }
    const slide = await Slide.findById(req.params.id)
    if (!slide) { removeTemp(req.file); return res.status(404).json({ message: 'Slide not found' }) }
    if (!(await linkExists(checked.fields.link))) { removeTemp(req.file); return res.status(400).json({ message: 'The linked product or category no longer exists' }) }

    const f = checked.fields
    // Schedule check against the value that will be saved, not only what was sent.
    const starts = f.startsAt !== undefined ? f.startsAt : slide.startsAt
    const ends = f.endsAt !== undefined ? f.endsAt : slide.endsAt
    if (starts && ends && ends <= starts) { removeTemp(req.file); return res.status(400).json({ message: 'End date must be after the start date' }) }

    let oldImageId = null
    if (req.file) {
      const uploaded = await uploadCloudinary(req.file.path)
      if (!uploaded) return res.status(500).json({ message: 'Image upload failed' })
      oldImageId = slide.image && slide.image.imageId
      slide.image = { url: uploaded.secure_url, imageId: uploaded.public_id }
    }
    Object.assign(slide, f)
    await slide.save()
    // Old image removed only after the new one is saved, so a failure never leaves a slide without one.
    if (oldImageId) await cloudinary.uploader.destroy(oldImageId).catch(() => {})
    res.status(200).json({ message: 'Slide updated', slide })
  } catch (error) {
    removeTemp(req.file)
    res.status(500).json({ message: error.message })
  }
}

const deleteSlide = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Slide not found' })
    const slide = await Slide.findByIdAndDelete(req.params.id)
    if (!slide) return res.status(404).json({ message: 'Slide not found' })
    if (slide.image && slide.image.imageId) await cloudinary.uploader.destroy(slide.image.imageId).catch(() => {})
    res.status(200).json({ message: 'Slide deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// PUT /carousel/order  body { ids: [slideId, ...] } in the new order.
const reorderSlides = async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null
    if (!ids || !ids.every((id) => mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'ids must be a list of slide ids' })
    const count = await Slide.countDocuments({ _id: { $in: ids } })
    const total = await Slide.countDocuments()
    // The full list, no duplicates: a partial list would leave two slides with the same position.
    if (count !== ids.length || new Set(ids).size !== ids.length || total !== ids.length) {
      return res.status(400).json({ message: 'The slide list changed. Please reload and try again.' })
    }
    await Slide.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i } } } })))
    res.status(200).json({ message: 'Order saved' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// PUT /carousel/settings  body { showAuto: boolean }
const updateSettings = async (req, res) => {
  try {
    if (typeof (req.body && req.body.showAuto) !== 'boolean') return res.status(400).json({ message: 'showAuto must be true or false' })
    const current = await getSettings()
    const value = { ...current, showAuto: req.body.showAuto }
    await SiteSetting.updateOne({ key: SETTING_KEY }, { $set: { value } }, { upsert: true })
    res.status(200).json({ settings: value })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = {
  getLiveCarousel, getAllSlides, createSlide, updateSlide, deleteSlide, reorderSlides, updateSettings,
  checkSlide, hrefOf, isLive,
}
