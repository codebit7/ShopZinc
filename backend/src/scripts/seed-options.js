// Adds choices (Size, Color...) to a few seeded products, so the product page pickers,
// cart lines and orders have real data to show.
// Dry run by default — prints what it would change. Add --apply to write.
//   node src/scripts/seed-options.js           (dry run)
//   node src/scripts/seed-options.js --apply   (writes)
// Safe to run twice: a product that already has choices is skipped, never overwritten
// (so choices an admin set by hand are kept).
require('dotenv').config()
const mongoose = require('mongoose')
const Product = require('../models/productModel.js')
const { cleanOptions } = require('../utils/options.js')

const APPLY = process.argv.includes('--apply')

const CHOICES = {
  'Cotton T-Shirt': [
    { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    { name: 'Color', values: ['White', 'Black', 'Navy'] },
  ],
  'Denim Jacket': [
    { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
  ],
  'Winter Coat': [
    { name: 'Size', values: ['M', 'L', 'XL'] },
    { name: 'Color', values: ['Black', 'Camel'] },
  ],
  'Running Shoes': [
    { name: 'Size', values: ['40', '41', '42', '43', '44'] },
  ],
  'Smartphone X': [
    { name: 'Storage', values: ['128GB', '256GB'] },
    { name: 'Color', values: ['Black', 'White'] },
  ],
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  let changed = 0
  for (const [name, raw] of Object.entries(CHOICES)) {
    // Same cleaning as the admin form goes through, so seeded data can't break the rules.
    const { options, error } = cleanOptions(raw)
    if (error) throw new Error(`${name}: ${error}`)
    const product = await Product.findOne({ name })
    if (!product) { console.log(`SKIP  ${name}: not found`); continue }
    if (product.options && product.options.length) { console.log(`SKIP  ${name}: already has choices`); continue }
    const text = options.map((o) => `${o.name} [${o.values.join(', ')}]`).join('; ')
    console.log(`${APPLY ? 'SET ' : 'WOULD SET'} ${name} (${product._id}): ${text}`)
    if (APPLY) await Product.updateOne({ _id: product._id }, { $set: { options } })
    changed++
  }
  console.log(`${changed} product(s) ${APPLY ? 'updated' : 'would be updated'}.${APPLY ? '' : ' Run again with --apply to write.'}`)
  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
