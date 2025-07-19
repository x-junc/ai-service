import dotenv from 'dotenv';
dotenv.config();
import mongoose from "mongoose";
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {});
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.log(err.message);
    console.error("❌ Database Connection Failed");
    throw new Error("❌ Database Connection Failed")
  }
};

export default connectDB;