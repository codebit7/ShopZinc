// Adds extra photos to a few seeded products, so the product details page has a real
// multi-photo gallery to show (every seeded product had only 1 photo, so the thumbnails never appeared).
// Dry run by default — prints what it would change. Add --apply to write.
//   node src/scripts/seed-extra-photos.js           (dry run)
//   node src/scripts/seed-extra-photos.js --apply   (writes)
// Safe to run twice: a photo whose imageId is already on the product is skipped.
require('dotenv').config()
const mongoose = require('mongoose')
const Product = require('../models/productModel.js')

const APPLY = process.argv.includes('--apply')

// Same URL shape and fake "seed/..." imageId as seed-dummy.js. Each photo was checked by eye.
const photo = (id) => `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&q=80`
const EXTRA = {
  'Smartphone X': ['1592899677977-9c10ca588bbd', '1510557880182-3d4d3cba35a5', '1580910051074-3eb694886505'],
  'Laptop Pro 16': ['1517336714731-489689fd1ca8', '1525547719571-a2d4ac8945e2', '1541807084-5c52b6b3adef'],
  'Wireless Earbuds': ['1606220588913-b3aacb4d2f46', '1572569511254-d8f925fe2cbb'],
  'Running Shoes': ['1460353581641-37baddab0fa2', '1608231387042-66d1773070a5'],
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  let changed = 0
  for (const [name, ids] of Object.entries(EXTRA)) {
    const product = await Product.findOne({ name })
    if (!product) { console.log(`SKIP  ${name}: not found`); continue }
    const have = new Set(product.images.map((img) => img.imageId))
    const add = ids
      .map((id, i) => ({ url: photo(id), imageId: `seed/${name}-${i + 2}` }))
      .filter((img) => !have.has(img.imageId))
    if (add.length === 0) { console.log(`SKIP  ${name}: already has these photos`); continue }
    console.log(`${APPLY ? 'ADD ' : 'WOULD ADD'} ${add.length} photo(s) to ${name} (${product._id}) — ${product.images.length} -> ${product.images.length + add.length}`)
    if (APPLY) await Product.updateOne({ _id: product._id }, { $push: { images: { $each: add } } })
    changed++
  }
  console.log(`${changed} product(s) ${APPLY ? 'updated' : 'would be updated'}.${APPLY ? '' : ' Run again with --apply to write.'}`)
  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
