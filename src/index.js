import express from 'express'
import dotenv from 'dotenv'
import connectDB from './DB/db.js'
import { app } from './app.js'

dotenv.config({path: './env'})


const port= process.env.PORT || 4000
connectDB()
.then(()=>{
    app.listen(port, ()=>{
        console.log(`Server is running at port : ${port}`);
    })
})
.catch((error)=>{
    console.log("MongoDB Connection Failed !!!", error);
})