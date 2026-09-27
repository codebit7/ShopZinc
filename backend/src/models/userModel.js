const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    name:{type:String, required : true},
    // email:{type:String, required : true, unique : true},
    // lowercase + trim so "Foo@x.com" and "foo@x.com" can't become two accounts
    // (BUG-86). Only applies on save: query filters are NOT normalised by the
    // schema, so controllers must call normalizeEmail before findOne.
    email:{type:String, required : true, unique : true, lowercase : true, trim : true},
    password:{type:String, required : true},
    role:{type:String, enum:['admin','user'], default : 'user'},
    // New accounts start unverified and cannot log in until they click the
    // emailed link. Pre-existing users have no such field, so it reads
    // undefined (falsy) — see scripts/backfill-verified.js.
    isVerified:{type:Boolean, default: false},
    verifyTokenHash:{type:String},
    verifyTokenExpires:{type:Date},
    // Password reset. Only the SHA-256 hash is stored, so a DB dump yields no
    // usable reset link. resetRequestedAt drives the 60s "send again" cooldown.
    resetTokenHash:{type:String},
    resetTokenExpires:{type:Date},
    resetRequestedAt:{type:Date},
    // Last "someone tried to sign up with your email" notice. Register no longer
    // says 409 for a taken email (BUG-83), it emails the owner instead; this
    // throttles that email so register can't be used to spam an inbox.
    existsNoticeAt:{type:Date},
    addresses:[
        {
            street:String,
            city:String,
            state:String,
            postalCode:String,
            country:String,
            isDefault:{type:Boolean,default:false}
        }
    ],

    orderHistory:[{type:mongoose.Schema.Types.ObjectId, ref:'Order'}],
    cart:{type:mongoose.Schema.Types.ObjectId, ref:'Cart'},
    wishlist:[{type:mongoose.Schema.Types.ObjectId, ref:'Product'}],
}, {timestamps:true})


module.exports = User = mongoose.model('User',userSchema)