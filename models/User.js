// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
  companyName: { type: String, required: true },
  companyAddress: { type: String, required: true },
  role: { type: String, default: 'user' },
  date: { type: Date, default: Date.now },

  // FORGOT PASSWORD FIELDS
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
});

module.exports = mongoose.model('User', UserSchema);