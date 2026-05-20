import { Router } from "express";
import { changeCurrentPassword, getCurrentUser, getUserChannelProfile, getWatchHistory, loginUser, logoutUser, refreshAccessToken, registerUser, updateAccountDetails, updateAvatar, updateCoverImage } from "../Controllers/user.controller.js";
import { upload } from "../Middlewares/multer.middleware.js";
import { verifyJWT } from "../Middlewares/auth.middleware.js";

const router = Router()

router.route("/register").post(
    upload.fields([           //injecting middleware
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]), 
    registerUser
)

router.route("/login").post(loginUser)

//Secured Routes
router.route("/logout").post(
    verifyJWT,      //middleware injected
    logoutUser
)

router.route("/refresh-token").post(refreshAccessToken)

router.route("/change-password").post(
    verifyJWT,   //middleware to only verified user can change password
    changeCurrentPassword
)

router.route("/current-user").get(
    verifyJWT,
    getCurrentUser
)


router.route("/update-account").patch(  //because post updates every detail
    verifyJWT,
    updateAccountDetails
)

router.route("/avatar").patch(
    verifyJWT,
    upload.single("avatar"),
    updateAvatar
)

router.route("/cover-image").patch(
    verifyJWT,
    upload.single("coverImage"),
    updateCoverImage
)

router.route("/c/:username").get(    //when u are taking username from url , this syntax is followed
    verifyJWT,
    getUserChannelProfile
)

router.route("/history").get(
    verifyJWT,
    getWatchHistory
)

export default router