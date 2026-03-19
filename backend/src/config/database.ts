import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function checkConnection() {
    try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    console.log("✅ Kết nối MongoDB thành công!");
    return conn;
  } catch (err) {
    console.error("❌ Kết nối thất bại:", err);
    throw err;
  }
}

export default checkConnection;