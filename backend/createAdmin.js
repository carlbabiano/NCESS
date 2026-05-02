
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Admin from "./models/Admin.js";
dotenv.config();

async function createAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  const email = process.env.ADMIN_EMAIL;
  const plainPassword = process.env.ADMIN_PASSWORD;
  const hash = await bcrypt.hash(plainPassword, 10);
  await Admin.create({ email, password: hash });
  console.log("Admin created");
  await mongoose.disconnect();
}

createAdmin();