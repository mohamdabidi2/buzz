const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["admin", "worker"], default: "worker" },
  department: String, 
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
