import mongoose from "mongoose";
import colors from "colors";
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully".bgYellow);
  } catch (error) {
    console.error("MongoDB connection failed:".bgYellow, error.message);
    process.exit(1);
  }
};

export default connectDB;
