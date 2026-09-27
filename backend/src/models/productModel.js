const mongoose = require('mongoose')


// One customer review. timestamps: the product page shows when it was written.
// verified: written through the buyers-only review route (the user had a delivered order with it).
const ratingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    verified: { type: Boolean, default: false },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    // What one unit cost the store, for profit reports. null = not entered (profit unknown).
    // select:false so it never reaches shoppers through find()/populate(); admin code asks for it
    // with '+costPrice'. Aggregations ignore select, so any aggregate returning products must $project it out.
    costPrice: { type: Number, default: null, min: 0, select: false },
    discount: { type: Number, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: String },
    // condition:{type: String , default: "Any"},
    // "Any" is a filter option, not a real condition; it made products unfindable by condition.
    condition:{type: String , default: "New"},
    stock: { type: Number, required: true },
    images: [{
        url:String,
       imageId:String
      }], 
    // ratings: [{
    //   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    //   rating: { type: Number, required: true },
    //   comment: { type: String }
    // }],
    // Same fields as before plus verified + timestamps (see ratingSchema). Old reviews still load.
    ratings: [ratingSchema],
    averageRating: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    // Choices the shopper must pick, e.g. [{ name: 'Storage', values: ['128GB','256GB'], extras: [0, 20000] }].
    // extras[i] = Rs added to the price when values[i] is picked (missing = 0, so older data still works).
    // Empty = no choices, and the product works exactly as before. Rules live in utils/options.js.
    options: {
      type: [{ _id: false, name: { type: String, required: true }, values: [String], extras: [Number] }],
      default: [],
    },
  }, { timestamps: true });
  
  module.exports = Product = mongoose.model('Product', productSchema);
  