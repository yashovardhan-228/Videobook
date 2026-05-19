import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { User } from "../Models/user.model.js";
import { uploadOnCloudinary } from "../Utils/cloudinary.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens= async(userId)=>{
    try {
        const user= await User.findById(userId)
        const accessToken=  user.generateAccessToken()
        const refreshToken=  user.generateRefreshToken()

        user.refreshToken= refreshToken
        await user.save({validateBeforeSave: false})  //if u don't put it false, it will check for password before storing in mongo db and hence error

        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

const registerUser= asyncHandler( async (req, res)=>{

    // Steps -

    // 1. get user detail from frontend depending on user model made
    // 2. validations - not empty, proper email format, etc
    // 3. check if user already exists(with username or email)
    // 4. check for files( images and avatar in this case)
    // 5. upload them on cloudinary and get corresponding url for storing in db
    // 6. create user object and create entry in db (as mongo is non sql so objects)
    // 7. remove password and refresh taken field from response to be sent to frontend
    // 8. check for user creation
    // 9. return response

    const {fullname, email, username, password} = req.body
    
    if([fullname, email, username, password].some((field)=> field?.trim() === "")){
        throw new ApiError(400, "All fields are required")
    }

    const existingUser= await User.findOne({
        $or: [{username}, {email}]
    })
    if(existingUser){
        throw new ApiError(409, "User with this email or username already exists")
    }


    const avatarLocalPath= req.files?.avatar[0]?.path
    // const coverImageLocalPath= req.files?.coverImage[0].path   //since coverimage is not required so if user does not provide so this way creates undefined error. So we check for it manually using if else.

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalPath= req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    } 

    const avatar= await uploadOnCloudinary(avatarLocalPath)
    const coverImage= await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    const user= await User.create({
        fullname,
        avatar: avatar.url,
        username: username.toLowerCase(),
        coverImage: coverImage?.url || "",
        email,
        password
    })

    const createdUser= await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully")
    )

} )


//Login 
const loginUser= asyncHandler( async (req, res)=>{
    //steps -
    //1. get data from user
    //2. check for empty
    //3. match username and password from data
    //4. return refresh token and access token
    //5. send cookies

    const {email, username, password}= req.body

    if(!username && !email){
        throw new ApiError(400, "Username or Email is required")
    }

    const user= await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid= await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid User Credentials")
    }

    const {accessToken, refreshToken}= await generateAccessAndRefreshTokens(user._id)
    const loggedInUser= await User.findById(user._id).select("-password -refreshToken")  // to update the user with refresh token and password. So that it can be checked


    //cookies
    const options= {
        httpOnly: true,
        secure: true   //now these cookies can only be modified by server not from frontend.
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },  //this part is data 
            "User logged in successfully"
        )
    )
})


//Logout
const logoutUser= asyncHandler(async(req, res)=>{
    // clear all cookies and reset refresh token of user from db
    //user added due to middleware run before this method in user.route.js

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {    //operator of mongo db to update
                refreshToken: undefined
            }
        },
        {
            new : true     //new updated value is returned.
        }
    )

    const options= {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"))
})

//endpoint to refresh accesstoken with the help of refresh token.
const refreshAccessToken= asyncHandler( async (req, res)=>{
    const incomingRefreshToken = req.cookies.refreshAccessToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized Request")
    }

    //verify-
    try {
        const decodedToken= jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)    //jwt.verify() returns decodes payload of the refresh token. Like we had defined ._id in refreshToken in user.model.js. 
            
        const user= User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401, "Invalid Refresh Token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or used") 
        }
    
        //since refresh token is valid so generate new access and refresh tokens using method defined above.
        const options={
            httpOnly: true,
            secure: true
        }
        const {newAccessToken, newRefreshToken}= await generateAccessAndRefreshTokens(user._id)
        return res.
        status(200)
        .cookie("accessToken", newAccessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken: newAccessToken, 
                    refreshToken: newRefreshToken
                },
                "Access Token Refreshed Successfully"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
}