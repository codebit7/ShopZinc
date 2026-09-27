const express = require('express')
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken.js')
const verifyRole = require('../middlewares/verifyRole.js');


const upload = require('../middlewares/multer.js');
const {createCategory, updateCategory,deleteCategory, getAllCategories, updateCategoryCover}= require('../controllers/categoryCtrl.js');



router
    .route('/')
    .post(verifyToken, verifyRole(["admin"]),createCategory)
    .get(getAllCategories)
router.put('/:id',verifyToken, verifyRole(["admin"]),updateCategory)
router.delete('/:id',verifyToken, verifyRole(["admin"]),deleteCategory)
// verifyToken before verifyRole (BUG-04), and auth before multer so anonymous uploads never hit disk.
router.put('/:id/cover', verifyToken, verifyRole(['admin']), upload.single('image'), updateCategoryCover)
router






module.exports = router