import express from 'express'
import dotenv from 'dotenv'
import connectDB from './DB/db.js'

dotenv.config({path: './env'})

connectDB()