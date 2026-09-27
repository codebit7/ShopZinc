const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken.js')
const verifyRole = require('../middlewares/verifyRole.js')
const upload = require('../middlewares/multer.js')
const {
  getLiveCarousel, getAllSlides, createSlide, updateSlide, deleteSlide, reorderSlides, updateSettings,
} = require('../controllers/carouselController.js')

const admin = [verifyToken, verifyRole(['admin'])]

// Public: what the home page shows right now.
router.get('/', getLiveCarousel)

// Admin. Auth runs before multer, so anonymous uploads never reach the disk.
// /order and /settings are declared before /:id so they are not read as an id.
router.get('/admin', ...admin, getAllSlides)
router.put('/order', ...admin, reorderSlides)
router.put('/settings', ...admin, updateSettings)
router.post('/', ...admin, upload.single('image'), createSlide)
router.put('/:id', ...admin, upload.single('image'), updateSlide)
router.delete('/:id', ...admin, deleteSlide)

module.exports = router
