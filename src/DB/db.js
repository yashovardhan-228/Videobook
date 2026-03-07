import mongoose from "mongoose";
import { DB_Name } from "../constants.js";

const connectDB= async ()=>{
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_Name}`)
        console.log(`\nMongoDB Connected !! DB HOST : ${connectionInstance.connection.host}`);
        
    } catch (error) {
        console.log("MongoDb Connection Failed : ",error);
        throw error
    }
}

export default connectDB