const mongoose = require('mongoose')



const cartSchema = new mongoose.Schema({
    // Why unique: two fast "add to cart" clicks could each create a cart for the same user.
    // The index makes the DB reject the second one (checked: no user had 2 carts when added).
    // user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      // What the shopper picked, e.g. [{ name: 'Size', value: 'M' }]. Same product with a different
      // pick is a separate line, so "Shirt M" and "Shirt L" can both be in the cart.
      selected: { type: [{ _id: false, name: String, value: String }], default: [] },
    }],
    total : {type: Number, default: 0}
  }, { timestamps: true });
  
  module.exports =  Cart = mongoose.model('Cart', cartSchema);
  