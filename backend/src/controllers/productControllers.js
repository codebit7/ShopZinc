const Product = require('../models/productModel.js');
const Category = require('../models/categoryModel.js');
const uploadCloudinary = require('../utils/cloudinary.js');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const { cleanOptions } = require('../utils/options.js');
const fs = require('fs');

// Multer writes the files to disk before the controller runs; only uploadCloudinary deletes them.
// Any early return before the upload loop left them in backend/public forever. Errors ignored:
// the file may already be gone (uploadCloudinary deletes it in both paths).
function removeTempFiles(req) {
    const f = req.files;
    const list = Array.isArray(f) ? [...f] : (f && typeof f === 'object' ? Object.values(f).flat() : []);
    if (req.file) list.push(req.file);
    for (const file of list) {
        if (file && file.path) fs.unlink(file.path, () => {});
    }
}

// Query numbers: a bad or missing value falls back to the default, a huge one is capped.
// Without the cap, ?limit=100000000 loads the whole collection; without the fallback, NaN broke $limit (500).
function toPositiveInt(raw, def, max) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return def;
    return Math.min(n, max);
}

// Cost price from the admin form. "" / missing = null (not entered). Returns { value } or { error }.
function parseCostPrice(raw) {
    if (raw === undefined || raw === null || raw === '' || raw === 'null') return { value: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: 'Cost price must be 0 or more' };
    return { value: Math.round(n * 100) / 100 };
}

// Create product
async function createProduct(req, res) {
    const { name, description, category, price, brand, stock ,condition ,discount, isFeatured} = req.body;
    const files = req.files;
    console.log("Files:", req.files);

    if ([name, description, category, price, brand, stock,condition].some(item => item === "")) {
        removeTempFiles(req);
        return res.status(400).json({ message: "Please fill all the fields" });
    }

    if (!files || files.length === 0) {
        return res.status(400).json({ message: "Please add an image" });
    }

    // Checked before the Cloudinary upload, so a bad choices list doesn't leave orphan images.
    const opts = cleanOptions(req.body.options);
    if (opts.error) { removeTempFiles(req); return res.status(400).json({ message: opts.error }); }
    const cost = parseCostPrice(req.body.costPrice);
    if (cost.error) { removeTempFiles(req); return res.status(400).json({ message: cost.error }); }

    const uploadedUrls = [];
    for (const file of files) {
        const imageUrl = await uploadCloudinary(file.path);
        if (imageUrl) {
            uploadedUrls.push({
                url: imageUrl.secure_url,
                imageId: imageUrl.public_id
            });
        }
    }

    if (uploadedUrls.length === 0) {
        return res.status(500).json({ message: "No images were uploaded" });
    }

    try {
        const newProduct = new Product({
            name,
            description,
            price,
            condition,
            discount,
            category,
            brand,
            stock,
            // Admin form sends it; without this it was silently dropped. Mongoose casts "true"/"false".
            isFeatured,
            options: opts.options,
            costPrice: cost.value,
            images: uploadedUrls
        });

        await newProduct.save();
        res.status(201).json({ message: 'Product created successfully', product: newProduct });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}


async function updateProduct(req, res) {
    const { imagesToRemove, existingImages } = req.body;
    // Default to [] so an edit with no new images doesn't throw on the for-of below (BUG-32).
    const files = req.files || [];

    // Only reject fields sent empty; fields not sent at all are left unchanged (partial update).
    const fields = ['name', 'description', 'category', 'price', 'brand', 'stock', 'discount', 'condition', 'isFeatured'];
    if (['name', 'category', 'price', 'stock'].some(f => req.body[f] === "")) {
        removeTempFiles(req);
        return res.status(400).json({ message: "Please fill all the fields" });
    }
    // Not sent = leave choices as they are (partial update). Sent "[]" = remove all choices.
    let opts = null;
    if (req.body.options !== undefined) {
        opts = cleanOptions(req.body.options);
        if (opts.error) { removeTempFiles(req); return res.status(400).json({ message: opts.error }); }
    }
    // Same partial-update rule: not sent = unchanged, "" = clear it.
    let cost = null;
    if (req.body.costPrice !== undefined) {
        cost = parseCostPrice(req.body.costPrice);
        if (cost.error) { removeTempFiles(req); return res.status(400).json({ message: cost.error }); }
    }

    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            removeTempFiles(req);
            return res.status(404).json({ message: "Product not found" });
        }


        // if (imagesToRemove && Array.isArray(imagesToRemove)) {
        //     for (const imageId of imagesToRemove) {
        //         await cloudinary.uploader.destroy(imageId);
        //         product.images = product.images.filter(img => img.imageId !== imageId);
        //     }
        // }
        //
        // if (existingImages !== undefined) {
        //     let kept;
        //     try { kept = JSON.parse(existingImages); } catch { return res.status(400).json({ message: "existingImages must be a JSON array" }); }
        //     if (!Array.isArray(kept)) return res.status(400).json({ message: "existingImages must be a JSON array" });
        //     const keepIds = new Set(kept.map(img => img && img.imageId));
        //     for (const img of product.images) {
        //         if (!keepIds.has(img.imageId)) await cloudinary.uploader.destroy(img.imageId);
        //     }
        //     product.images = product.images.filter(img => keepIds.has(img.imageId));
        // }

        // Validate everything first, then destroy. Before, imagesToRemove destroyed ANY Cloudinary id
        // sent (another product's, a carousel slide's), and a bad existingImages returned 400 only
        // after images were already deleted.
        const ownIds = new Set(product.images.map(img => img.imageId));

        // Form sends the images the admin kept as a JSON string; drop the rest from Cloudinary too,
        // otherwise removed images stay on the product and orphaned in Cloudinary.
        let keepIds = null;
        if (existingImages !== undefined) {
            let kept;
            try { kept = JSON.parse(existingImages); } catch { removeTempFiles(req); return res.status(400).json({ message: "existingImages must be a JSON array" }); }
            if (!Array.isArray(kept)) { removeTempFiles(req); return res.status(400).json({ message: "existingImages must be a JSON array" }); }
            keepIds = new Set(kept.map(img => img && img.imageId));
        }

        // Only ids that belong to this product; foreign ids are ignored, not destroyed.
        const toDestroy = new Set();
        if (Array.isArray(imagesToRemove)) {
            for (const imageId of imagesToRemove) if (ownIds.has(imageId)) toDestroy.add(imageId);
        }
        if (keepIds) {
            for (const id of ownIds) if (!keepIds.has(id)) toDestroy.add(id);
        }
        for (const imageId of toDestroy) await cloudinary.uploader.destroy(imageId);
        product.images = product.images.filter(img => !toDestroy.has(img.imageId));


        const uploadedImages = [];
        for (const file of files) {
            const imageUrl = await uploadCloudinary(file.path);
            if (imageUrl) {
                uploadedImages.push({
                    url: imageUrl.secure_url,
                    imageId: imageUrl.public_id
                });
            }
        }

        product.images.push(...uploadedImages);

        // Assigning undefined wiped required fields (name/price/stock) and failed validation.
        // Mongoose casts the multipart strings ("12", "true") to the schema types on save.
        if (opts) product.options = opts.options;
        if (cost) product.costPrice = cost.value;
        for (const f of fields) {
            if (req.body[f] !== undefined) product[f] = req.body[f];
        }

        await product.save();
        await product.populate('category');

        res.status(200).json({ message: "Product successfully updated", product });

    } catch (error) {
        // e.g. a bad :id throws a CastError before the upload loop ran; files would stay on disk.
        removeTempFiles(req);
        res.status(500).json({ message: "Something went wrong", error: error.message });
    }
}

// Delete product
async function deleteProduct(req, res) {
    try {
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        if (!deletedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

       
        for (const image of deletedProduct.images) {
            await cloudinary.uploader.destroy(image.imageId);
        }

        res.json({ message: 'Product deleted successfully', deletedProduct });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
}

// Get categories
async function getCategory(req, res) {
    try {
        const categories = await Category.find();
        res.json({ categories });

    } catch (error) {
        res.status(500).json({ message: 'Error retrieving categories', error });
    }
}


// Pure filter builder shared by /products and /products/facets, so both always agree on what
// a filter means. `omit` leaves out one filter so a facet can count "what if I changed this one".
// Keys match the query params: category, minPrice, maxPrice, minDiscount, brand, condition,
// featured, minRating, search.
function buildProductFilter(query = {}, { omit = [] } = {}) {
    const skip = new Set(omit);
    const { category, minPrice, maxPrice, minDiscount, brand, condition, featured, search, minRating } = query;
    const filters = {};
    // Only a real ObjectId: the navbar still sends category names, which made find() throw a CastError (500).
    // Cast here because aggregate() (used by facets) does not auto-cast strings like find() does.
    if (!skip.has('category') && category && /^[a-f\d]{24}$/i.test(category)) {
        filters.category = new mongoose.Types.ObjectId(String(category));
    }

    // Homepage category sections filter server-side; otherwise filters only see one page (BUG-57).
    const num = v => (v === undefined || v === '' || isNaN(Number(v))) ? undefined : Number(v);
    const min = skip.has('minPrice') ? undefined : num(minPrice);
    const max = skip.has('maxPrice') ? undefined : num(maxPrice);
    const minDisc = num(minDiscount);
    if (min !== undefined || max !== undefined) {
        filters.price = {};
        if (min !== undefined) filters.price.$gte = min;
        if (max !== undefined) filters.price.$lte = max;
    }
    if (!skip.has('minDiscount') && minDisc !== undefined) filters.discount = { $gte: minDisc };
    // Comma list so the filter page can tick several brands at once.
    if (!skip.has('brand') && brand) filters.brand = { $in: String(brand).split(',').filter(Boolean) };
    // if (!skip.has('condition') && condition && condition !== 'Any') filters.condition = condition;
    // String only: ?condition[$ne]=x arrives as an object and became a Mongo operator (NoSQL injection).
    if (!skip.has('condition') && typeof condition === 'string' && condition && condition !== 'Any') filters.condition = condition;
    if (!skip.has('featured') && featured === 'true') filters.isFeatured = true;
    const minRate = num(minRating);
    if (!skip.has('minRating') && minRate) filters.averageRating = { $gte: minRate };
    // Escaped so user input can't inject regex syntax (and a stray "(" can't throw).
    // $or over brand too: shoppers type "samsung" and expect the brand to match, not only the name.
    if (!skip.has('search') && search && String(search).trim()) {
        const rx = { $regex: String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        filters.$or = [{ name: rx }, { brand: rx }];
    }
    return filters;
}

async function getProducts(req, res) {
    try {
        let { page = 1, limit = 10, category} = req.query;
        console.log("fetch products hit");
        

        // const pageNum = parseInt(page, 10);
        // const limitNum = parseInt(limit, 10);
        // if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
        //     return res.status(400).json({ message: "Invalid pagination parameters" });
        // }
        // Max 1000, not 50: admin Dashboard / Categories / Inventory / CarouselManager load the whole
        // catalog with limit=1000, a lower cap would silently cut their lists.
        const pageNum = toPositiveInt(page, 1, 100000);
        const limitNum = toPositiveInt(limit, 10, 1000);

        // Moved into buildProductFilter so /products/facets uses the exact same rules.
        // const filters = {};
        // if (category && /^[a-f\d]{24}$/i.test(category)) { filters.category = category; }
        // ...price / discount / brand / condition / featured / minRating / search (name only)...
        const filters = buildProductFilter(req.query);
        const { sort } = req.query;

        // Unknown/missing sort keeps the old unsorted behaviour.
        const sortMap = {
            newest: { createdAt: -1 },
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            discount_desc: { discount: -1 },
        };
        const sortBy = sortMap[sort];

        const skip = (pageNum - 1) * limitNum;


        const totalProducts = await Product.countDocuments(filters);

        let query = Product.find(filters);
        if (sortBy) query = query.sort(sortBy);
        const products = await query
            .skip(skip)
            .limit(limitNum)
            .populate('category');

        res.status(200).json({
            data: products,
            totalProducts,
            totalPage: Math.ceil(totalProducts / limitNum),
        });

    } catch (error) {
        res.status(500).json({ message: 'Error retrieving products', error: error.message });
    }
}

// Counts for the filter sidebar. Each facet ignores its own filter, so the sidebar can show
// "how many if I pick this" instead of dropping to 0 for every option not already picked.
async function getProductFacets(req, res) {
    try {
        const q = req.query;
        const f = omit => buildProductFilter(q, { omit });
        const group = (match, field) => Product.aggregate([
            { $match: match },
            { $group: { _id: '$' + field, count: { $sum: 1 } } },
        ]);

        const ratingMins = [4, 3, 2, 1];
        const ratingBase = f(['minRating']);
        const [catCounts, allCategories, brandCounts, condCounts, ratingCounts, priceAgg, total] = await Promise.all([
            group(f(['category']), 'category'),
            Category.find({}, 'name').sort({ name: 1 }).lean(),
            group(f(['brand']), 'brand'),
            group(f(['condition']), 'condition'),
            Promise.all(ratingMins.map(min => Product.countDocuments({ ...ratingBase, averageRating: { $gte: min } }))),
            Product.aggregate([
                { $match: f(['minPrice', 'maxPrice']) },
                { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
            ]),
            Product.countDocuments(f([])),
        ]);

        // Every category is listed, even with 0, so the sidebar list does not jump around.
        const catMap = new Map(catCounts.map(c => [String(c._id), c.count]));
        const categories = allCategories.map(c => ({ _id: c._id, name: c.name, count: catMap.get(String(c._id)) || 0 }));

        // Only brands with products, plus the ones the user already ticked (so they can untick them).
        const brandMap = new Map(brandCounts.filter(b => b._id !== null && b._id !== '').map(b => [b._id, b.count]));
        const selected = q.brand ? String(q.brand).split(',').filter(Boolean) : [];
        for (const b of selected) if (!brandMap.has(b)) brandMap.set(b, 0);
        const brands = [...brandMap].map(([name, count]) => ({ name, count }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        // 'Any' is legacy data (old default), not a condition a shopper can pick.
        const conditions = condCounts.filter(c => c._id !== null && c._id !== '' && c._id !== 'Any')
            .map(c => ({ name: c._id, count: c.count }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const ratings = ratingMins.map((min, i) => ({ min, count: ratingCounts[i] }));
        // No matching products -> 0/0, so the client never gets null in a number field.
        const price = priceAgg[0] ? { min: priceAgg[0].min, max: priceAgg[0].max } : { min: 0, max: 0 };

        res.status(200).json({ categories, brands, conditions, ratings, price, total });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving product facets', error: error.message });
    }
}

// Distinct brands for the filter sidebar, so it lists what the catalog really has.
async function getBrands(req, res) {
    try {
        const brands = await Product.distinct('brand', { brand: { $nin: [null, ''] } });
        res.status(200).json(brands.sort((a, b) => a.localeCompare(b)));
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving brands', error: error.message });
    }
}

// Get product by ID
async function getProductById(req, res) {
    try {
        // ratings.user name: the product page shows who wrote each review (name only, nothing private).
        const product = await Product.findById(req.params.id).populate('category').populate('ratings.user', 'name');
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.status(200).json({ message: "OK", data: product });

    } catch (error) {
        res.status(500).json({ message: 'Error retrieving product', error });
    }
}

// Product Rating
// Superseded by controllers/reviewController.js (buyers only, one review per user, recomputes the
// average). This one was never routed; kept only because it is still exported.
async function productRating(req, res) {
    try {
        const { productId, rating, comment } = req.body;
        const userId = req.user.id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        product.ratings.push({ user: userId, rating, comment });
        await product.save();
        
        res.status(200).json({ message: "Rating added successfully" });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}




async  function getRecommededProducts(req, res){
       try {

        let { limit = 10 } = req.query;
        // limit = parseInt(limit, 10);
        // NaN here made $limit throw (500); frontend never asks for more than a handful.
        limit = toPositiveInt(limit, 10, 50);

        const recommededItems = await Product.aggregate([

            {
                $addFields: {
                    averageRating: { $avg: "$ratings.rating" }
                }
            },
            {
                $sort: { averageRating: -1 } 
            },
            {
                $limit: limit
            },
            // Public endpoint: aggregate() ignores the schema's select:false, so drop cost here.
            { $project: { costPrice: 0 } }
        ])



        res.status(200).json({
            message: "Recommeded products retrieved successfully",
            data: recommededItems
        });
        
       } catch (error) {
        res.status(500).json({ message: "Error retrieving recommeded products", error: error.message });
       }

}



async function productDeals(req,res){
    try{
        let {limit = 10} = req.query;
        // limit = parseInt(limit, 10);
        // NaN / 0 meant "no limit" to Mongo = whole collection; frontend asks for 1 or 5.
        limit = toPositiveInt(limit, 10, 50);
        // Admin-configurable threshold; default 10 keeps the old behaviour.
        const minDiscount = Number(req.query.minDiscount);
        const threshold = req.query.minDiscount === undefined || req.query.minDiscount === '' || isNaN(minDiscount) ? 10 : minDiscount;
        const productDeals = await Product.find({discount:{$gt:threshold}})
        .sort({discount:-1})
        .limit(limit);

        if(productDeals){
            res.status(200).json({
                message: "Product deals retrieved successfully",
                data: productDeals
                });
        }
        else{
            res.status(404).json({
                message: "No product deals found",
                data: null
                });
         }


    }
    catch(error){
        res.status(500).json({message: "Error retrieving product deals", error: error.message});
    }
}



// tem function 

const createProducts = async (req, res) => {
    try {
        const products = req.body;
        const files = req.files; 

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ message: "Invalid product data" });
        }

        const newProducts = [];

        for (const product of products) {
            const { name, description, category, price, brand, stock, condition, discount } = product;

            
            if ([name, description, category, price, brand, stock].some(item => item === "")) {
                return res.status(400).json({ message: "Please fill all the fields for each product" });
            }

         
            const productImages = files.filter(file => file.fieldname.startsWith(`images_${name}`));

            if (productImages.length === 0) {
                return res.status(400).json({ message: `Please add images for product: ${name}` });
            }

            
            const uploadedUrls = [];
            for (const file of productImages) {
                const imageUrl = await uploadCloudinary(file.path);
                if (imageUrl) {
                    uploadedUrls.push({
                        url: imageUrl.secure_url,
                        imageId: imageUrl.public_id
                    });
                }
            }

            if (uploadedUrls.length === 0) {
                return res.status(500).json({ message: `No images were uploaded for ${name}` });
            }

           
            const newProduct = new Product({
                name,
                description,
                price,
                condition,
                discount,
                category,
                brand,
                stock,
                images: uploadedUrls
            });

            newProducts.push(newProduct);
        }

       
        await Product.insertMany(newProducts);
        res.status(201).json({ message: 'Products created successfully', products: newProducts });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Admin only: one product WITH its cost price, for the edit form. The public GET /product/:id hides it.
async function getProductForAdmin(req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Product not found' });
        const product = await Product.findById(req.params.id).select('+costPrice').populate('category');
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json({ data: product });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getProductForAdmin,
    getProducts,
    getProductFacets,
    buildProductFilter,
    getBrands,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategory,
    productRating,
    getRecommededProducts,
    productDeals,
    createProducts
};
