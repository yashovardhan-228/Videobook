import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { User } from "../Models/user.model.js";
import { uploadOnCloudinary } from "../Utils/cloudinary.js";
import { ApiResponse } from "../Utils/ApiResponse.js";

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

export {registerUser}