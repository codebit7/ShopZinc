const Category = require('../models/categoryModel.js')
const Product = require('../models/productModel.js')
const uploadCloudinary = require('../utils/cloudinary.js')
const cloudinary = require('cloudinary').v2
const fs = require('fs')



const createCategory = async(req,res)=>{
    try {
        const {name, description} = req.body;

        if(!name || !description){
            return res.status(400).json({message: "Please fill in all fields"})
        }
      const category = await Category.findOne({name})
      if(category){
        return res.status(400).json({message: "Category already exists"})
      }
      const newCategory = await Category.create({name, description})
    
      await newCategory.save();
      res.status(200).json(newCategory)
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}

const updateCategory = async(req,res)=>{
    try {
        const {id}= req.params;

        // Old version required name+description on every call; the homepage toggles send only their own fields.
        // const {name , description} =req.body;
        // if (!id || !name || !description) {
        //     return res.status(400).json({ message: "Please provide all required fields" });
        // }
        // const category = await Category.findByIdAndUpdate(id, { $set:{name,description} }, {new:true})

        // Whitelist: anything else in the body (e.g. coverImage) must not be writable here.
        const allowed = ['name', 'description', 'showOnHome', 'homeOrder', 'homeFilters'];
        if (req.body.name === '' || req.body.description === '') {
            return res.status(400).json({ message: "Please provide all required fields" });
        }

        const category = await Category.findById(id)
        if(!category){
            return res.status(400).json({message: "this category is not exist"})
        }

        for (const f of allowed) {
            if (req.body[f] === undefined) continue;
            if (f === 'homeFilters') {
                // Pick known keys only, merged onto the existing filters.
                const hf = req.body.homeFilters || {};
                for (const k of ['minPrice', 'maxPrice', 'minDiscount', 'sort', 'limit']) {
                    if (hf[k] !== undefined) category.homeFilters[k] = hf[k];
                }
            } else {
                category[f] = req.body[f];
            }
        }
        // save() runs schema validation (sort enum, number casts) that findByIdAndUpdate skipped.
        await category.save();


       res.status(200).json({message:"Successfully Updated",category})
       console.log("ok");
       
        
    } catch (error) {
        // Bad enum/number or duplicate name is bad input, not a server crash; 500 hid that from the admin UI.
        if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({message:error.message})
        if (error.code === 11000) return res.status(409).json({message:"A category with this name already exists"})
        res.status(500).json({message:error.message})
    }
}
const deleteCategory = async(req,res)=>{
    try {
        const {id} = req.params

        // Deleting a category in use left products pointing at nothing (BUG-37); the admin UI needs a clear reason.
        const inUse = await Product.countDocuments({ category: id });
        if (inUse > 0) return res.status(409).json({ message: `Cannot delete: ${inUse} product(s) use this category` });

       const category =  await Category.findByIdAndDelete(id);
       if(!category) return  res.status(404).json({message:"category Not found"});

       res.status(200).json({message:"deleted category successfully"});
        
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}


const getAllCategories = async(req,res)=>{
    try {
        // ?home=1 feeds the homepage sections: only enabled ones, in the admin's chosen order.
        const category = req.query.home === '1'
            ? await Category.find({ showOnHome: true }).sort({ homeOrder: 1, name: 1 })
            : await Category.find()
        // Dead guard (BUG-22): always false. An empty list is not an error, so the 200 [] below is right.
        // if(!category.length === 0) return res.status(404).json({message:"categories not found",category:[]});
        res.status(200).json(category)
        
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}

// Cover image for the homepage section; same upload/cleanup path as product images.
const updateCategoryCover = async(req,res)=>{
    try {
        if (!req.file) return res.status(400).json({ message: "Please add an image" });

        const category = await Category.findById(req.params.id);
        if (!category) {
            // Multer already wrote the temp file; remove it so ./public doesn't fill up.
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ message: "category Not found" });
        }

        const uploaded = await uploadCloudinary(req.file.path); // deletes the temp file either way
        if (!uploaded) return res.status(500).json({ message: "Image upload failed" });

        // Drop the old cover only after the new one is up, so a failed upload keeps the old image.
        const oldId = category.coverImage && category.coverImage.imageId;
        category.coverImage = { url: uploaded.secure_url, imageId: uploaded.public_id };
        await category.save();
        if (oldId) await cloudinary.uploader.destroy(oldId);

        res.status(200).json({message:"Successfully Updated",category})
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}

module.exports ={
    createCategory,
    updateCategory,
    deleteCategory,
    getAllCategories,
    updateCategoryCover
}