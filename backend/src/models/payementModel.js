const mongoose = require('mongoose')



const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    paymentMethod: { 
      type: String, 
      // enum: ['credit_card', 'paypal', 'stripe'], 
      // Old values kept so existing rows still validate; cod/jazzcash/easypaisa are the new methods.
      enum: ['credit_card', 'paypal', 'stripe', 'cod', 'jazzcash', 'easypaisa'],
      required: true },
    paymentStatus: {
       type: String, enum:
        ['pending', 'completed', 'failed'],
         default: 'pending' 
        },
    transactionId: { type: String },
    // Gateway's own reference and raw callback payload, kept for disputes / reconciliation later.
    gatewayRef: { type: String },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },
    // JazzCash/Easypaisa charge in PKR only, so the currency must be stored, not assumed.
    // Store switched to PKR; old rows keep the 'USD' they were saved with (no conversion).
    // currency: { type: String, default: 'USD' },
    currency: { type: String, default: 'PKR' },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, default: Date.now },
  }, { timestamps: true });
  
module.exports = Payment = mongoose.model('Payment', paymentSchema);
  