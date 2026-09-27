const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      priceAtTimeOfOrder: { type: Number, required: true },
      // Product cost when ordered (null = no cost price was set), so later cost changes don't
      // rewrite past profit. select:false: customers load their own orders and must not see it.
      costAtTimeOfOrder: { type: Number, default: null, select: false },
      // Copied from the cart line, so the admin knows which size/colour to ship.
      selected: { type: [{ _id: false, name: String, value: String }], default: [] },
    }],


    shippingAddress: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      // The courier (PostEx) cannot book a parcel without the buyer's mobile number.
      phone: String
    },

    // Courier booking. Empty until the admin books it. status is the courier's own words
    // ("Delivered", "Out For Delivery"...), shown as-is; only "Delivered" changes the order.
    shipment: {
      courier: String,
      trackingNumber: String,
      status: String,
      bookedAt: Date,
      lastCheckedAt: Date,
      // true while a booking call is running, so two clicks cannot book the parcel twice.
      booking: { type: Boolean, select: false },
      // Courier's raw reply, kept to check the unverified field names in sandbox.
      lastResponse: { type: mongoose.Schema.Types.Mixed, select: false },
    },

    
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    // How the buyer chose to pay. Default 'cod' so orders saved before this field existed stay valid.
    paymentMethod: { type: String, enum: ['cod', 'jazzcash', 'easypaisa'], default: 'cod' },
    orderStatus: { type: String, enum: ['processing', 'shipped', 'delivered', 'cancelled'], default: 'processing' },
    // Delivery charge at order time (already included in totalAmount). Default 0: older orders had none.
    shippingFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    orderDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date },
  }, { timestamps: true });
  
  module.exports =  Order = mongoose.model('Order', orderSchema);
  