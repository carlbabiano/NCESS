// run with: node setAdminRole.mjs
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
const Admin = mongoose.model('Admin', new mongoose.Schema({ email: String, password: String, role: String, firstName: String, lastName: String }));

// Change the email and role as needed
await Admin.updateOne(
  { email: 'ncsecretary@gmail.com' },
  { $set: { role: 'secretary', firstName: 'YourFirstName', lastName: 'YourLastName' } }
);

console.log('Secretary role set.');
await mongoose.disconnect();