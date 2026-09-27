const User  = require("../models/userModel")
 function  verifyRole(roles){
    return async (req,res,next)=>{
        // Why try/catch: this is async, so a DB error (or a missing req.user) became an
        // unhandled rejection and the request hung with no response.
        try {
        const user =await User.findById(req.user.id)
        if(!user) return res.status(404).send({message:"User not found"})
        if(!roles.includes(user.role)){
           return res.status(400).json({message:`You are  not Autherizod to ${roles}`})
        }
        } catch (error) {
            console.error("verifyRole failed:", error)
            // Generic message on purpose: error.message can leak DB details to the client.
            return res.status(500).json({message:"Server error"})
        }
        next();
    }
}

module.exports = verifyRole;
