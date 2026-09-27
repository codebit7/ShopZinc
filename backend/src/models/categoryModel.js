const mongoose = require('mongoose')

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    // Admin picks which categories get a homepage section, in what order, and which products it shows.
    showOnHome: { type: Boolean, default: false },
    homeOrder: { type: Number, default: 0 },
    homeFilters: {
      minPrice: Number,
      maxPrice: Number,
      minDiscount: Number,
      sort: { type: String, enum: ['newest', 'price_asc', 'price_desc', 'discount_desc'], default: 'newest' },
      limit: { type: Number, default: 8 },
    },
    coverImage: { url: String, imageId: String },
    // parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // Nested categories
  }, { timestamps: true });
  
  module.exports = Category = mongoose.model('Category', categorySchema);
  