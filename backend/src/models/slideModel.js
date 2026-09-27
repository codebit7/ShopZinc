const mongoose = require('mongoose')

// One home-page carousel slide made by the admin (Admin → Carousel).
// The automatic slides (home categories + best deal) are not stored; they are built on the fly.
const slideSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  subtitle: { type: String, trim: true, maxlength: 200, default: '' },
  // Small text above the title, e.g. "Summer sale".
  eyebrow: { type: String, trim: true, maxlength: 40, default: '' },
  image: { url: { type: String, required: true }, imageId: String },
  // Where the button goes. type 'none' = no button.
  link: {
    type: { type: String, enum: ['product', 'category', 'url', 'none'], default: 'none' },
    value: { type: String, default: '' },
  },
  buttonText: { type: String, trim: true, maxlength: 24, default: 'Shop now' },
  active: { type: Boolean, default: true },
  // Lower first. New slides go to the end.
  order: { type: Number, default: 0 },
  // Optional schedule, e.g. a sale banner that shows only during the sale. null = no limit.
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
}, { timestamps: true })

// Same pattern as refreshTokenModel.js: no leaked implicit global.
const Slide = mongoose.model('Slide', slideSchema)
module.exports = Slide
