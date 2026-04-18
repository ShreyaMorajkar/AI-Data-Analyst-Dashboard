const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationTokenHash: {
    type: String,
    default: null,
  },
  emailVerificationExpiresAt: {
    type: Date,
    default: null,
  },
  emailVerifiedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
