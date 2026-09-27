const Cart = require('../models/cartModel.js')
const Product = require('../models/productModel.js')
const User = require('../models/userModel.js')
// Why: one shared money helper, so the cart total and the order total can never disagree.
const { cartTotals, unitPrice } = require('../utils/pricing.js')
// Delivery fee shown in the cart is the same rule createOrder charges.
const { deliveryFee, shippingRule } = require('../config/shipping.js')
// Why: product choices (Size, Color...) use the same rules as the product and order code.
const { pickSelection, sameSelection } = require('../utils/options.js')



// Why commented out: it ignored the percent discount and read 0 for unpopulated items (BUG-14).
// Totals now come from utils/pricing.js cartTotals().
// function calculateTotal(items){
//     let total = 0;
//     items.forEach(item => {
//         if (item.product && item.product.price) {
//             total += Number(item.product.price) * item.quantity;
//         }
//     })
//     return total
// }


// ---- Small pure helpers (exported so they can be checked without a DB) ----

// Works for both a raw ObjectId and a populated product.
function lineProductId(item){
    const p = item && item.product
    if (!p) return null
    return (p._id || p).toString()
}

// Returns an error message, or null when the quantity is fine.
// Why: 0 / negative / 1.5 / missing quantity used to be stored and broke the total (BUG-15).
function checkQuantity(quantity, stock){
    if (!Number.isInteger(quantity) || quantity < 1) {
        return 'Quantity must be a whole number of 1 or more'
    }
    const left = Number(stock) || 0
    if (quantity > left) {
        return left > 0 ? `Only ${left} left` : 'Out of stock'
    }
    return null
}

// Total quantity of this product in OTHER lines (e.g. Size M while we change Size L).
// Why: stock is per product, not per choice, so all lines of one product share it.
function otherLinesQty(items, productId, skipIndex){
    return (items || []).reduce((sum, item, i) =>
        i !== skipIndex && lineProductId(item) === String(productId) ? sum + (Number(item.quantity) || 0) : sum, 0)
}

// Plans an "add to cart": finds an existing line for this product + choices and adds to it.
// Returns { error } or { index, quantity } (index -1 means "push a new line").
function planAdd(items, productId, quantity, stock, selected = []){
    // Why: validate the add itself first, so qty 0 / 1.5 is a quantity error, not a stock error.
    const qtyError = checkQuantity(quantity, Infinity)
    if (qtyError) return { error: qtyError }
    // Why: compare ids as strings. The old `toString ==` (no call) was always false,
    // so every add made a duplicate line (BUG-12).
    // const index = (items || []).findIndex((item) => lineProductId(item) === String(productId))
    // Same product with different choices is a different line ("Shirt M" and "Shirt L").
    const index = (items || []).findIndex((item) =>
        lineProductId(item) === String(productId) && sameSelection(item.selected || [], selected))
    // Why: adding again must add to the count, not replace it (BUG-13),
    // and the stock check is on what the line will hold after the merge.
    const merged = (index > -1 ? items[index].quantity : 0) + quantity
    // const stockError = checkQuantity(merged, stock)
    const stockError = checkQuantity(merged, Math.max(0, (Number(stock) || 0) - otherLinesQty(items, productId, index)))
    if (stockError) return { error: stockError }
    return { index, quantity: merged }
}

// Finds a cart line by its own _id. Falls back to the product id so older clients, and products
// without choices, keep working. With choices, only the line _id can tell two sizes apart.
function findLine(items, key){
    const list = items || []
    const byLine = list.findIndex((item) => item._id && String(item._id) === String(key))
    if (byLine > -1) return byLine
    return list.findIndex((item) => lineProductId(item) === String(key))
}

// Every cart response has this same shape, so the frontend never does its own math.
// function emptyCart(){
//     return { items: [], subtotal: 0, discount: 0, total: 0 }
// }
// `total` stays the items total (unchanged meaning); shippingFee + grandTotal are added on top,
// and freeShippingFrom lets the cart say "add Rs X more for free delivery".
function withShipping(totals){
    const shippingFee = deliveryFee(totals.total)
    return { ...totals, shippingFee, grandTotal: Math.round((totals.total + shippingFee) * 100) / 100, freeShippingFrom: shippingRule().freeFrom }
}
function emptyCart(){
    return { items: [], ...withShipping({ subtotal: 0, discount: 0, total: 0 }) }
}

// Populates products, drops lines whose product was deleted, recomputes and saves the total,
// then returns the cart plus subtotal / discount / total.
async function finalizeCart(cart){
    if (!cart) return emptyCart()
    await cart.populate('items.product')
    // Why: a deleted product populates as null and crashed the UI on item.product._id.
    const live = cart.items.filter((item) => item.product)
    // Why only when needed: GET /cart runs this too, and should not write when nothing changed.
    if (live.length !== cart.items.length) cart.items = live
    const totals = cartTotals(cart.items)
    if (cart.total !== totals.total) cart.total = totals.total
    if (cart.isNew || cart.isModified()) await cart.save()
    const obj = cart.toObject()
    // Why unitPrice per line: the UI shows the discounted price without doing its own money math.
    // obj.items = obj.items.map((item) => ({ ...item, unitPrice: unitPrice(item.product) }))
    // With the line's choices, so "256GB" shows its extra price.
    obj.items = obj.items.map((item) => ({ ...item, unitPrice: unitPrice(item.product, item.selected) }))
    // return { ...obj, ...totals }
    return { ...obj, ...withShipping(totals) }
}


const addCartItem = async(req,res)=>{
    try {

        const {id} = req.user
        const {productId,quantity} = req.body

        // Why first: a bad quantity (0, -1, 1.5, missing) needs no DB call (BUG-15).
        // Without this it waited for the product + cart reads before planAdd rejected it.
        const badQty = checkQuantity(quantity, Infinity)
        if (badQty) return res.status(400).json({ message: badQty })

        const product = await Product.findById(productId)
        if(!product) return res.status(404).json({message:"Product not found"});

        // A product with choices needs one valid value for each; one without choices ignores `selected`.
        const pick = pickSelection(product.options, req.body.selected)
        if (pick.error) return res.status(400).json({ message: pick.error })

        let cart = await Cart.findOne({user:id})

        let plan = planAdd(cart ? cart.items : [], productId, quantity, product.stock, pick.selected)
        if (plan.error) return res.status(400).json({ message: plan.error })

        // Why commented out: findOne + new Cart() is not atomic. Two fast clicks both saw
        // "no cart" and both created one, so the user ended up with two carts.
        // if(!cart){
        //    cart = new Cart({
        //     user:id,
        //     items:[{product:productId, quantity:plan.quantity, selected:pick.selected}],
        //    });
        //
        //    //update the cart in User model if  cart not create
        // await  User.findByIdAndUpdate(id,
        //     {$set:{cart:cart._id}},
        //     {new: true}
        // );
        //
        // }
        if(!cart){
            // Atomic get-or-create: only one request can insert, the other gets the same cart.
            try {
                cart = await Cart.findOneAndUpdate(
                    {user:id},
                    {$setOnInsert:{user:id, items:[], total:0}},
                    {upsert:true, new:true}
                )
            } catch (err) {
                // Two upserts can still race; the unique index rejects the loser (E11000),
                // so read the cart the winner just made.
                if (err && err.code === 11000) cart = await Cart.findOne({user:id})
                else throw err
            }

            //update the cart in User model if  cart not create
            await  User.findByIdAndUpdate(id,
                {$set:{cart:cart._id}},
                {new: true}
            );

            // Why re-plan: the racing request may already have put items in this cart.
            plan = planAdd(cart.items, productId, quantity, product.stock, pick.selected)
            if (plan.error) return res.status(400).json({ message: plan.error })
        }

        if(plan.index > -1){
            cart.items[plan.index].quantity = plan.quantity
        }
        else{
            cart.items.push({product:productId, quantity:plan.quantity, selected:pick.selected})
        }

        res.status(200).json(await finalizeCart(cart));

    } catch (error) {
        res.status(500).json({message:error.message})
    }
}


const deleteCartItem = async(req,res)=>{
    try {
        const {id} = req.user
        // A cart line _id (or, for older clients, a product id) - see findLine.
        const {itemId} = req.params

        // Why not populated here: a line whose product was deleted must still be removable.
        const cart = await Cart.findOne({user:id})

        // Why: no cart just means an empty cart, not an error.
        // if(!cart){
        //    return res.status(404).json({message:"Cart not found"});
        // }
        if(!cart) return res.status(200).json(emptyCart());

        // Why commented out: this ran on every single item removal and cut the user -> cart
        // link even when items were still in the cart (BUG-11).
        // await User.findByIdAndUpdate(id,
        //     { $unset: { cart: "" } },
        //     { new: true }
        // );

        // const itemIndex = cart.items.findIndex((item) => lineProductId(item) === productId)
        const itemIndex = findLine(cart.items, itemId)

        // Why: removing a line that is already gone is not an error; the UI just needs the fresh cart.
        // else{ return res.status(404).json({message:"Item not found in cart"}) }
        if(itemIndex > -1)
        {
            cart.items.splice(itemIndex,1)
        }

        res.status(200).json(await finalizeCart(cart));

    } catch (error) {
        res.status(500).json({message:error.message})
    }

}
const updateCartItem = async (req, res) => {

    try {
      const { id } = req.user;
      // A cart line _id (or, for older clients, a product id) - see findLine.
      const  {itemId} =req.params
      const {quantity } = req.body;

      // Why first: a bad quantity needs no DB call at all.
      const badQty = checkQuantity(quantity, Infinity)
      if (badQty) return res.status(400).json({ message: badQty });

      // Why the line is found before the product: the param may be a line id, not a product id.
      const cart = await Cart.findOne({ user: id })
      const itemIndex = cart ? findLine(cart.items, itemId) : -1
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Cart or item not found" });
      }
      const productId = lineProductId(cart.items[itemIndex])

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Why: without this, the UI minus button could store 0 or negative quantities,
      // or more than is in stock (BUG-15). Other sizes/colours of this product share the stock.
      // const qtyError = checkQuantity(quantity, product.stock)
      const qtyError = checkQuantity(quantity, Math.max(0, product.stock - otherLinesQty(cart.items, productId, itemIndex)))
      if (qtyError) {
        return res.status(400).json({ message: qtyError });
      }

      // Why replaced: findOneAndUpdate + a separate save did two writes; one load/save is simpler
      // and goes through the same finalize path as every other cart call.
      // const updatedCart = await Cart.findOneAndUpdate(
      //   { user: id, "items.product": productId},
      //   { $set: { "items.$.quantity": quantity } },
      //   { new: true, runValidators: true }
      // ).populate('items.product');
      // (moved above: the line is looked up first now)
      // const cart = await Cart.findOne({ user: id })
      // const itemIndex = cart ? cart.items.findIndex((item) => lineProductId(item) === productId) : -1
      // if (itemIndex === -1) {
      //   return res.status(404).json({ message: "Cart or item not found" });
      // }
      cart.items[itemIndex].quantity = quantity

      res.status(200).json(await finalizeCart(cart));

    } catch (error) {

      res.status(500).json({ message: error.message });
    }
  };

const clearCart = async(req,res)=>{
    try {
        const {id} = req.user
        const cart = await Cart.findOne({user:id})
        // Why: no cart just means an empty cart, not an error.
        // if(!cart){
        //     return res.status(404).json({message:"Cart not found"});
        // }
        if(!cart) return res.status(200).json(emptyCart());

        cart.items = []
        res.status(200).json(await finalizeCart(cart));

    } catch (error) {
        res.status(500).json({message:error.message})
    }
}
const getCartItems = async(req,res)=>{

    try {
        const {id} = req.user

        const cart = await Cart.findOne({user:id})

        // Why: no cart yet just means an empty cart. The 404 made the frontend treat it as an error.
        // if(!cart)
        // {
        //     return res.status(404).json({message:"Cart not found"});
        // }
        // Why: finalizeCart also drops deleted-product lines and fixes a stale stored total.
        res.status(200).json(await finalizeCart(cart));

    } catch (error) {
        res.status(500).json({message:error.message})
    }
}





module.exports={
          addCartItem,
          deleteCartItem,
          updateCartItem,
          clearCart,
          getCartItems,
          // exported for the check script only
          lineProductId,
          checkQuantity,
          planAdd,
          findLine,
          emptyCart
}
