// Dummy data for manually testing every phase (cart, wishlist, catalog, admin, orders, payments).
// Every row gets `seed: true`, so it can be wiped without touching real data.
//
//   node src/scripts/seed-dummy.js           wipe old seed rows, then insert fresh ones
//   node src/scripts/seed-dummy.js --clean   only wipe seed rows
//
// All seed users log in with password  Seed@1234
require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const connectDb = require('../DB/dbConnection.js')
const User = require('../models/userModel.js')
const Category = require('../models/categoryModel.js')
const Product = require('../models/productModel.js')
const Cart = require('../models/cartModel.js')
const Order = require('../models/orderModel.js')
const Payment = require('../models/payementModel.js')
const RefreshToken = require('../models/refreshTokenModel.js')

const MODELS = [Payment, Order, Cart, Product, Category, User]
const now = new Date()

// Build through the model (defaults + validation), then add the marker the schema would strip.
async function build(Model, obj) {
  const doc = new Model(obj)
  await doc.validate()
  return { ...doc.toObject(), seed: true, createdAt: now, updatedAt: now }
}

async function clean() {
  const seedUserIds = (await User.collection.find({ seed: true }, { projection: { _id: 1 } }).toArray()).map(u => u._id)
  await RefreshToken.deleteMany({ user: { $in: seedUserIds } })
  for (const M of MODELS) {
    // Rows the app itself creates while testing (a new cart, order, payment) carry no marker, so
    // also match them by owner — otherwise they'd be left pointing at deleted seed users.
    const owned = [Payment, Order, Cart].includes(M) ? [{ user: { $in: seedUserIds } }] : []
    const { deletedCount } = await M.collection.deleteMany({ $or: [{ seed: true }, ...owned] })
    console.log(`removed ${deletedCount} seed ${M.collection.name}`)
  }
}

async function seed() {
  const password = await bcrypt.hash('Seed@1234', 10)
  const address = { street: '12 Test Street', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan', isDefault: true }

  const [user, user2, admin, unverified] = await Promise.all([
    build(User, { name: 'Seed User', email: 'user@seed.test', password, isVerified: true, addresses: [address] }),
    build(User, { name: 'Seed Other User', email: 'user2@seed.test', password, isVerified: true, addresses: [address] }),
    build(User, { name: 'Seed Admin', email: 'admin@seed.test', password, role: 'admin', isVerified: true }),
    build(User, { name: 'Seed Unverified', email: 'unverified@seed.test', password }),
  ])

  // Real Unsplash photos (free licence, hotlink allowed) so the storefront doesn't look like a wireframe.
  // imageId is a fake "seed/..." id: Cloudinary destroy on it is a harmless not-found, same as before.
  const photo = (id, w = 600) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${w}&fit=crop&q=80`
  // showOnHome + cover: the home page sections are admin-driven now, so without this a fresh seed shows none.
  const cover = (id, slug) => ({ url: photo(id, 800), imageId: `seed/cover-${slug}` })

  const [electronics, clothing, home, empty] = await Promise.all([
    build(Category, { name: 'Electronics', description: 'Phones, laptops, audio', showOnHome: true, homeOrder: 0, coverImage: cover('1498049794561-7780e7231661', 'electronics') }),
    build(Category, { name: 'Clothing', description: 'Shirts, shoes, jackets', showOnHome: true, homeOrder: 1, coverImage: cover('1445205170230-053b83016050', 'clothing') }),
    build(Category, { name: 'Home & Garden', description: 'Kitchen and outdoor', showOnHome: true, homeOrder: 2, coverImage: cover('1484101403633-562f891dc89a', 'home') }),
    build(Category, { name: 'Empty Category', description: 'No products — safe to delete' }),
  ])

  // const img = (text) => [{ url: `https://placehold.co/400x400?text=${encodeURIComponent(text)}`, imageId: `seed/${text}` }]
  // Each id was checked by hand to show the named product.
  const PHOTOS = {
    'Smartphone X': '1511707171634-5f897ff02aa9',
    'Budget Phone': '1598327105666-5b89351aff97',
    'Laptop Pro 16': '1496181133206-80ce9b88a853',
    'Gaming Laptop Ultra': '1603302576837-37561b2e2302',
    'Wireless Earbuds': '1590658268037-6bf12165a8df',
    'Old Tablet': '1544244015-0df4b3ffc6b0',
    'Sold Out Camera': '1516035069371-29a1b244cc32',
    'Cotton T-Shirt': '1521572163474-6864f9cf17ab',
    'Denim Jacket': '1551537482-f2075a1d41f2',
    'Running Shoes': '1542291026-7eec264c27ff',
    'Winter Coat': '1539533018447-63fcce2678e3',
    'Coffee Maker': '1608354580875-30bd4168b351',
    'Garden Chair': '1506439773649-6e0eb8cfb237',
  }
  const img = (name) => [{ url: photo(PHOTOS[name]), imageId: `seed/${name}` }]
  const rate = (...pairs) => pairs.map(([u, rating, comment]) => ({ user: u._id, rating, comment }))
  const avg = (r) => r.length ? +(r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(1) : 0

  // Prices are in PKR (the store currency) — realistic Pakistani prices.
  // 14 products: > 10 so /products?limit=10 has a page 2. Covers price edges, brands,
  // conditions, deals (discount > 10), no ratings, no images, zero and low stock.
  const specs = [
    ['Smartphone X', electronics, 249999, 15, 'Apple', 'New', 25, true, rate([user, 5, 'Great'], [user2, 4, 'Good'])],
    ['Budget Phone', electronics, 34999, 0, 'Samsung', 'New', 40, false, rate([user, 3, 'Ok'])],
    ['Laptop Pro 16', electronics, 389999, 30, 'Dell', 'Refurbished', 5, true, rate([user2, 4, 'Fast'])],
    ['Gaming Laptop Ultra', electronics, 549999, 5, 'Asus', 'New', 3, false, []],             // most expensive: above the 500000 price-slider max
    ['Wireless Earbuds', electronics, 7999, 20, 'Sony', 'New', 100, true, rate([user, 4, 'Nice'], [user2, 2, 'Meh'])],
    ['Old Tablet', electronics, 24999, 0, 'Lenovo', 'Used', 2, false, []],                    // low stock
    ['Sold Out Camera', electronics, 119999, 12, 'Canon', 'New', 0, false, rate([user, 5, 'Loved it'])], // no stock
    ['Cotton T-Shirt', clothing, 1499, 0, 'Nike', 'New', 200, false, rate([user, 4, 'Soft'])],
    ['Denim Jacket', clothing, 6999, 25, 'Levis', 'New', 30, true, rate([user2, 5, 'Perfect'])],
    ['Running Shoes', clothing, 12999, 10, 'Adidas', 'Used', 15, false, []],                  // discount exactly 10: not a deal
    ['Winter Coat', clothing, 18999, 40, 'Zara', 'New', 8, false, rate([user, 3, 'Warm'])],
    ['Coffee Maker', home, 21999, 0, 'Philips', 'New', 20, false, rate([user2, 4, 'Good coffee'])],
    ['Garden Chair', home, 999, 0, 'Ikea', 'New', 60, false, []],  // was 'Any' (not a real condition)                             // cheapest
    ['No Image Lamp', home, 3499, 0, 'Ikea', 'New', 10, false, []],                           // no images
  ]
  const products = await Promise.all(specs.map(([name, cat, price, discount, brand, condition, stock, isFeatured, ratings]) =>
    build(Product, {
      name, description: `Seed product: ${name}`, price, discount, category: cat._id, brand, condition, stock, isFeatured,
      images: name === 'No Image Lamp' ? [] : img(name), ratings, averageRating: avg(ratings),
    })))
  const p = Object.fromEntries(products.map(x => [x.name, x]))

  const line = (prod, quantity) => ({ product: prod._id, quantity })
  const cartItems = [line(p['Smartphone X'], 2), line(p['Cotton T-Shirt'], 3)]
  const cart = await build(Cart, {
    user: user._id, items: cartItems,
    total: cartItems.reduce((t, i) => t + products.find(x => x._id.equals(i.product)).price * i.quantity, 0),
  })

  const order = (u, status, paymentStatus, lines) => build(Order, {
    user: u._id, shippingAddress: address, orderStatus: status, paymentStatus,
    items: lines.map(([prod, quantity]) => ({ product: prod._id, quantity, priceAtTimeOfOrder: prod.price })),
    totalAmount: lines.reduce((t, [prod, q]) => t + prod.price * q, 0),
  })
  const orders = await Promise.all([
    order(user, 'processing', 'pending', [[p['Denim Jacket'], 1]]),                              // can still be cancelled
    order(user, 'shipped', 'paid', [[p['Wireless Earbuds'], 2], [p['Coffee Maker'], 1]]),
    order(user, 'delivered', 'paid', [[p['Budget Phone'], 1]]),
    order(user2, 'processing', 'pending', [[p['Winter Coat'], 1]]),                              // another user's order
  ])

  const payment = (o, u, paymentMethod, paymentStatus) => build(Payment, {
    user: u._id, order: o._id, paymentMethod, paymentStatus, amount: o.totalAmount, transactionId: `seed-${o._id}`,
  })
  const payments = await Promise.all([
    payment(orders[1], user, 'credit_card', 'completed'),
    payment(orders[2], user, 'paypal', 'completed'),
    payment(orders[3], user2, 'stripe', 'pending'),
  ])

  user.cart = cart._id
  user.wishlist = [p['Laptop Pro 16']._id, p['Denim Jacket']._id]
  user.orderHistory = orders.slice(0, 3).map(o => o._id)
  user2.orderHistory = [orders[3]._id]

  await User.collection.insertMany([user, user2, admin, unverified])
  await Category.collection.insertMany([electronics, clothing, home, empty])
  await Product.collection.insertMany(products)
  await Cart.collection.insertOne(cart)
  await Order.collection.insertMany(orders)
  await Payment.collection.insertMany(payments)

  console.log('inserted: 4 users, 4 categories, 14 products, 1 cart, 4 orders, 3 payments')
  console.log('logins (password Seed@1234): user@seed.test, user2@seed.test, admin@seed.test, unverified@seed.test')
}

;(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to seed a production database')
  await connectDb()
  try {
    await clean()
    if (!process.argv.includes('--clean')) await seed()
  } finally {
    await mongoose.disconnect()
  }
})().catch(e => { console.error(e); process.exit(1) })
