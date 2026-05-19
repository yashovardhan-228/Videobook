import { Router } from "express";
import { loginUser, logoutUser, refreshAccessToken, registerUser } from "../Controllers/user.controller.js";
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

export default router