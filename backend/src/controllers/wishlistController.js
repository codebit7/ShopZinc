const User = require('../models/userModel.js');
const Product = require('../models/productModel.js')

const addToWishlist = async(req,res)=>{
    try {
       const {item}  = req.body
       if(!item){
        return res.status(404).json({message:"item is required"});
       }
       
       const product = await Product.findById(item);
       if(!product){
        return res.status(404).json({message:"product not found"})
       }

       // $addToSet, not $push: $push let the same product be added many times (BUG-20).
       const user = await User.findByIdAndUpdate(
        req.user.id,
        {$addToSet:{wishlist:product._id}},
        {new:true}
       ).populate('wishlist')
        
    
       // Was `User.wishlist` (a model property, always undefined) (BUG-16). Frontend expects the populated array.
       res.status(200).json(user.wishlist);
        
    } catch (error) {
        res.status(500).json({error:error.message})
       
        
    }


}


const removeToWishlist = async(req,res)=>{
    try {
       const {item} = req.body;
       if(!item)
       {
        return res.status(404).json({message:"item is required"});
       }

       const product = await Product.findById(item);
       if(!product){
        return res.status(404).json({message:"product not found"})
       }

       // $pull, not $pop: $pop removed the LAST item, not the requested one (BUG-17).
       const user = await User.findByIdAndUpdate(
        req.user.id,
        {$pull:{wishlist:product._id}},
        {new:true}

       ).populate('wishlist')

       res.status(200).json(user.wishlist)
        
    } catch (error) {
        res.status(500).json({error:error.message})
    }

}

const clearWishlist = async(req,res)=>{
    try {
         const {id} = req.user;
        const user =await User.findById(id)
    
        user.wishlist = [];
        await user.save();
        // Without a response the request hung until the client timed out (BUG-18).
        res.status(200).json([]);
        
    } catch (error) {
        res.status(500).json({error:error.message})
    }

}

const getWishlist = async(req,res)=>{
    try {
        const {id} = req.user;
        // populate: bare ids were rendered as products by the page.
        const user =await User.findById(id).populate('wishlist')
        // Empty is not an error: 404 here made the frontend treat an empty wishlist as a failure (BUG-19).
        // if(user.wishlist.length == 0)
        // {
        //     return res.status(404).json({message:"Items not found in Wishlist"})
        // }
        res.status(200).json(user.wishlist);
        
    } catch (error) {
        res.status(500).json({error:error.message})
        console.log("error",error.message);
    }

}


module.exports = {
    addToWishlist,
    removeToWishlist,
    clearWishlist,
    getWishlist

}