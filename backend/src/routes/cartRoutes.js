const {addCartItem,updateCartItem, deleteCartItem,clearCart,getCartItems} = require('../controllers/CartController.js')
const verifyToken = require('../middlewares/verifyToken.js')
const express = require('express')
const router = express.Router()




router.post('/add', verifyToken, addCartItem)
// :itemId is the cart line _id. Why not the product id: with choices, one product can be several
// lines (Size M and Size L). A product id still works, for older clients - see findLine.
// router.put('/update/:productId', verifyToken, updateCartItem)
// router.post('/delete/:productId', verifyToken, deleteCartItem)
router.put('/update/:itemId', verifyToken, updateCartItem)
router.post('/delete/:itemId', verifyToken, deleteCartItem)
router.post('/clear', verifyToken, clearCart)
router.get('/', verifyToken, getCartItems)



module.exports = router








