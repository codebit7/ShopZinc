const express = require('express')
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken.js')
const { getCategory,
    getProductById,
    getProductForAdmin,
    getProducts, 
    getProductFacets,
    getBrands,
    createProduct,
     updateProduct, 
     deleteProduct,
     getRecommededProducts,
     productDeals,
     createProducts
    } = require('../controllers/productControllers.js');


const verifyRole = require('../middlewares/verifyRole.js');
const { reviewEligibility, upsertReview, deleteReview } = require('../controllers/reviewController.js');
const uplaod = require('../middlewares/multer.js');




// Admin routes

// Create Products
// verifyToken MUST come before verifyRole: verifyRole reads req.user.id, which
// verifyToken sets. Without it every create threw on undefined req.user.
router.route('/create').post(verifyToken,verifyRole(['admin']),uplaod.array('images',10),createProduct)
// router.route('/addAll').post(verifyToken,verifyRole(["admin"]),uplaod.array('images',10),createProducts)
// Update Products
router.route('/update/:id').put(verifyToken,verifyRole(['admin']),uplaod.array('images',10),updateProduct)
// Delete Products
// Was fully unauthenticated: anyone could delete any product and its Cloudinary images.
// Dropped the multer middleware too — a DELETE never carries an image upload.
router.route('/delete/:id').delete(verifyToken,verifyRole(['admin']), deleteProduct);





// customer routes
// Before '/products' on purpose: public sidebar counts, read-only, same query params as /products.
router.route('/products/facets').get(getProductFacets);
router.route('/products').get(getProducts);
router.route('/brands').get(getBrands); // public: feeds the filter sidebar
router.route('/product/:id',).get( getProductById)
// Admin: same product plus its cost price (hidden from the public route above).
router.route('/product/:id/admin').get(verifyToken, verifyRole(['admin']), getProductForAdmin)
// Reviews: buyers only (checked in the controller), one per user, author or admin can delete.
router.get('/product/:id/reviews/eligibility', verifyToken, reviewEligibility)
router.post('/product/:id/reviews', verifyToken, upsertReview)
router.delete('/product/:id/reviews/:reviewId', verifyToken, deleteReview)

// Public now: it powers the home page, and guests may browse products (client rule).
// With verifyToken, logged-out visitors got 401 and the section stayed empty.
// router.route('/recommendedProducts').get(verifyToken,getRecommededProducts);
router.route('/recommendedProducts').get(getRecommededProducts);

router.route('/productDeals').get(productDeals);


module.exports = router
