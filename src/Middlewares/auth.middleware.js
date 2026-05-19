import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import jwt from 'jsonwebtoken'
import { User } from "../Models/user.model.js";


export const verifyJWT= asyncHandler(async (req, res, next)=>{
    try {
        const token= req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")   //sometimes in case of mobile phones, we do not have cookies so we have to use header()
    
        if(!token){
            throw new ApiError(401, "Unauthorized request")
        }
    
        const decodedToken= jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    
        const user= await User.findById(decodedToken?._id).select("-password -refreshToken")  //while making access token we had defined _id in it. assigned with this.id (refer user.model.js)
        if(!user){
            throw new ApiError(401, "Invalid Access Token")
        }
    
        req.user= user;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access token")
    }

})