// models/Client.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true },
  password: String,
  mongoUriEncrypted: String,
  apiKey: { type: String, unique: true, sparse: true },
  confirmPassword: {
    type: String,
    required: [true, "Password confirmation is required"],
    validate: {
      validator: function (value) {
        // `this.password` is available only on `save()` or `create()`
        console.log();
        return value === this.password;
      },
      message: "Passwords do not match",
    },
  },
  resetCode: {
    type: Number,
    required: false,
  },
  resetCodeExpiresAt: {
    type: Date,
    required: false,
  },
  isResetCodeValide: {
    type: Boolean,
    default: false
  }
},
  { timestamps: true });


// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.confirmPassword = undefined; // Remove the confirmation field
  this.ChangesAt = Date.now() - 1000;
  next();
});

// Method to compare passwords
userSchema.methods.correctPassword = async function (candidatePassword, currentPassword) {
  return await bcrypt.compare(candidatePassword, currentPassword);
};
userSchema.methods.changedPasswordAfter = function (JWTTimestamps) {
  if (this.ChangesAt) {
    const changedTimestamps = parseInt(this.ChangesAt.getTime() / 1000, 10);
    return JWTTimestamps < changedTimestamps;
  }
  // false means that the pass does not changed
  return false;
}

userSchema.methods.createResetPassToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = new Date() + 10 * 60 * 1000;
  return resetToken
}
const UserModel = mongoose.model('User', userSchema);
export default UserModel
