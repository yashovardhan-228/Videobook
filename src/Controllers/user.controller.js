import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { User } from "../Models/user.model.js";
import { uploadOnCloudinary } from "../Utils/cloudinary.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose, { Mongoose } from "mongoose";

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


const changeCurrentPassword= asyncHandler( async(req, res)=>{
    const {oldPassword, newPassword}= req.body

    const user= await User.findById(req.user?._id)
    const isPasswordCorrect= await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old Password")
    }

    user.password= newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
        new ApiResponse(200, {}, "Password changed Successfully")
    )
})

const getCurrentUser= asyncHandler( async(req, res)=>{
    return res.status(200)
    .json(
        200,
        req.user,
        "Current User Fetched Successfully"
    )
})


const updateAccountDetails= asyncHandler(async (req, res)=>{
    const {fullname, email}= req.body

    if(!fullname || !email){
        throw new ApiError(400, "All fields are required")
    }

    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email,    //its equivalent to email: email due to ES6 syntax
            }
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Account Details Updated Successfully"
        )
    )
})


const updateAvatar= asyncHandler( async(req, res)=>{
    const avatarLocalPath= req.file?.path   //single file so not used req.files
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar= await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new ApiError(400, "Error while uploading avatar")
    }

    const user =await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated successfully")
    )
})

const updateCoverImage= asyncHandler( async(req, res)=>{
    const coverImageLocalPath= req.file?.path
    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image is missing")
    }

    const coverImage= await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading cover Image")
    }

    const user =await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Cover Image updates successfully"
        )
    )
})


const getUserChannelProfile= asyncHandler(async (req, res)=>{
    const {username}= req.params   //because generally we have to call this method when a particular url is hit and from that url we will take out username. So that's why req.params

    if(!username?.trim()){
        throw new ApiError(404, "Username is missing")
    }

    const channel= User.aggregate([    //this aggregate returns array. But in this case only one element will be there.
        {
            $match : {username : username?.toLowerCase()}  //to find channel with this username
        },     //at this moment we have only ne document with corresponding username. So now we will apply 2nd stage of this pipeline i.e. lookup
        {    //here starts 2nd stage lookup( i.e. connecting both doc for getting channel details like subscribers(count) from subscription schema   with corresponding username)
            $lookup:{
                from : "subscriptions",    //as Subscription model will be stored as subscriptions in mongo db
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },    //now we have got the channel in subscription schema for this username. We will count it also later on.
        {     // this stage is to find how many channels does that username has subscribed.
            $lookup:{
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: { //to keep existing fields and add new fields 
                subscribersCount: {
                    $size: "$subscribers"   //to count we use operator size. And now $subscribers because its a field now.
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {   //condition
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }  ////these three fields are added to existing user document.
            }
        },
        {
            $project: {     //projects only selected fields not all fields
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1     //now only these fields will be sent. Because only these fields are relevant to a channels page.
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404, "Channel Does not exist")
    }

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            channel[0],   //instead of returning whole array only first element is returned for frontend's sake.
            "User Channel Fetched Successfully"
        )
    )
})

const getWatchHistory= asyncHandler(async(req, res)=>{

    const user= await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",   //Video  model is stored as videos
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [   //nested pipeline because every video in watch history itself has owner field which is user only.
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline:[    //to remove unnecessary infos of user from shared in owner field and for that we  will use project
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }   //now owner field does not have irrelevant info about owner due to sub pipeline
                                }   
                            ]
                        }
                    },
                    {  //now this stage is just to return first value from the array.
                        $addFields: {
                            owner: {  //overwriting owner with only first element(json data) not giving complete array to frontend
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user[0].getWatchHistory,
            "Watch History Fetched Successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateAvatar,
    updateCoverImage,
    getUserChannelProfile,
    getWatchHistory
}