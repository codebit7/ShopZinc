const mongoose = require('mongoose')
const Product = require('../models/productModel.js')
const Order = require('../models/orderModel.js')
const User = require('../models/userModel.js')

// Product reviews. Rules (chosen by the store owner):
//   - Only buyers can review: the user needs a DELIVERED order that contains the product.
//   - One review per user per product; posting again edits it.
//   - The author can delete their own review; an admin can delete any (moderation).
//   - averageRating is recomputed on every change (it used to stay 0 forever — BUG-25).

const MAX_COMMENT = 1000

// Returns { rating, comment } or { error }. Pure, so it can be checked without a DB.
function checkReview(body = {}) {
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Please choose a rating from 1 to 5 stars' }
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment.length > MAX_COMMENT) return { error: `Please keep your review under ${MAX_COMMENT} characters` }
  return { rating, comment }
}

// One decimal, 0 when there are no ratings.
function averageOf(ratings = []) {
  if (!ratings.length) return 0
  return Math.round((ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length) * 10) / 10
}

const hasBought = (userId, productId) =>
  Order.exists({ user: userId, orderStatus: 'delivered', 'items.product': productId })

const sameId = (a, b) => a && b && String(a._id || a) === String(b._id || b)

// Same shape the product page already renders: ratings with reviewer names, plus the new average.
async function reviewsResponse(productId) {
  const p = await Product.findById(productId).select('ratings averageRating').populate('ratings.user', 'name').lean()
  return { ratings: p ? p.ratings : [], averageRating: p ? p.averageRating : 0 }
}

// GET /product/:id/reviews/eligibility — can the logged-in user review this product?
const reviewEligibility = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' })
    const product = await Product.findById(id).select('ratings.user ratings._id').lean()
    if (!product) return res.status(404).json({ message: 'Product not found' })
    const mine = (product.ratings || []).find((r) => sameId(r.user, req.user.id))
    const bought = Boolean(await hasBought(req.user.id, id))
    res.status(200).json({
      canReview: bought,
      hasReviewed: Boolean(mine),
      reviewId: mine ? mine._id : null,
      reason: bought ? null : 'Only customers who bought and received this product can review it.',
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// POST /product/:id/reviews — add or edit the caller's review.
const upsertReview = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' })
    const checked = checkReview(req.body)
    if (checked.error) return res.status(400).json({ message: checked.error })

    const product = await Product.findById(id)
    if (!product) return res.status(404).json({ message: 'Product not found' })
    if (!(await hasBought(req.user.id, id))) {
      return res.status(403).json({ message: 'Only customers who bought and received this product can review it.' })
    }

    const mine = product.ratings.find((r) => sameId(r.user, req.user.id))
    if (mine) {
      mine.rating = checked.rating
      mine.comment = checked.comment
      mine.verified = true
    } else {
      product.ratings.push({ user: req.user.id, rating: checked.rating, comment: checked.comment, verified: true })
    }
    product.averageRating = averageOf(product.ratings)
    // Only the review fields are validated: an older product with some other odd field must not
    // block a customer's review.
    await product.save({ validateModifiedOnly: true })

    res.status(mine ? 200 : 201).json({ message: mine ? 'Review updated' : 'Review added', ...(await reviewsResponse(id)) })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// DELETE /product/:id/reviews/:reviewId — the author or an admin.
const deleteReview = async (req, res) => {
  try {
    const { id, reviewId } = req.params
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(reviewId)) return res.status(404).json({ message: 'Review not found' })
    const product = await Product.findById(id)
    if (!product) return res.status(404).json({ message: 'Product not found' })
    const review = product.ratings.id(reviewId)
    if (!review) return res.status(404).json({ message: 'Review not found' })
    if (!sameId(review.user, req.user.id)) {
      // Role from the DB, not the token — same rule as verifyRole, so a demoted admin can't moderate.
      const me = await User.findById(req.user.id).select('role').lean()
      if (!me || me.role !== 'admin') return res.status(403).json({ message: 'You can only delete your own review' })
    }
    review.deleteOne()
    product.averageRating = averageOf(product.ratings)
    await product.save({ validateModifiedOnly: true })
    res.status(200).json({ message: 'Review deleted', ...(await reviewsResponse(id)) })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = { reviewEligibility, upsertReview, deleteReview, checkReview, averageOf, MAX_COMMENT }
