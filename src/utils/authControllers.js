import getModelByRole from "../utils/helper.js";
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';
import nodemailer from 'nodemailer';
import { generateVerificationToken, sendVerificationEmail } from '../utils/email.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Generate JWT
console.log();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN,
});
// Send Token Response
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  // Exclude password from response
  user.password = undefined;
  // Send token via secure cookie
  const cookieExpiresIn = process.env.JWT_COOKIE_EXPIRES_IN || 7; // Default to 7 days if not set
  // Send token via secure cookie
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(Date.now() + cookieExpiresIn * 24 * 60 * 60 * 1000),
  });
  const safeUser = user.toObject();
  delete safeUser.resetCode;
  delete safeUser.resetCodeExpiresAt;
  // JSON response
  res.status(statusCode).json({
    status: 'success',
    data: safeUser,
  });
};


// User Signup
const signup = async (req, res, next) => {
  try {
    const Model = getModelByRole(req);
    const user = await Model.findOne({ email: req.body.email });
    if (user) {
      throw new AppError("this email is already in use login using it", 400);
    }

    // Generate email verification token and set expiration
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // creat user in the db
    req.body.emailVerificationToken = verificationToken;
    req.body.emailVerificationExpires = verificationTokenExpires
    const newUser = await Model.create(req.body);

    // Send verification email
    try {
      await sendVerificationEmail(newUser.email, newUser.name, verificationToken);
    } catch (emailError) {
      // If email sending fails, delete the user and return error
      console.error("Failed to send verification email:", emailError);
      await Model.findByIdAndDelete(newUser._id)
      next(
        new AppError(
          "Failed to send verification email. Please try again.",
          500
        )
      );
      return;
    }
    createSendToken(newUser, 201, res);
  } catch (err) {
    next(err);
  }
};

//verify email
const verifyEmail = async (req, res, next) => {
  try {
    const Model = getModelByRole(req);
    const { token } = req.params;
    if (!token) {
      return next(new AppError("Verification token is required", 400));
    }

    // Find user with matching verification token
    const user = await Model.findOne({ emailVerificationToken: token })

    if (!user) {
      return next(new AppError("Invalid verification token", 400));
    }

    // Check if verification token has expired
    if (
      user.emailVerificationExpires &&
      new Date() > user.emailVerificationExpires
    ) {
      return next(new AppError("Verification token has expired", 400));
    }
    // Update user as verified and clear verification data
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save({ validateBeforeSave: false });
    // Log the user in after successful verification
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// User Login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // Check email and password
    if (!email || !password) {
      throw new AppError('Please provide email and password', 400);
    }
    const Model = getModelByRole(req);
    // Find user and include password field
    const user = await Model.findOne({ email })
    // Verify user and password
    if (!user || !(await user.correctPassword(password, user.password))) {
      throw new AppError('Please provide correct email or password', 400);
    }
    if (!user.isEmailVerified) {
      return res.status(401).json({
        status: "fail",
        message: "you need to verify your email first"
      })
    }
    // Send token to user
    createSendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // use 'true' in production
    sameSite: 'Strict', // or 'Lax' depending on your frontend setup
  });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};


//forgot password function
const sendResetCode = async (req, res, next) => {
  const { email } = req.body;
  try {
    const Model = getModelByRole(req);
    const user = await Model.findOne({ email });

    if (!user) {
      return res.status(400).json({ status: 'fail', message: 'Email not found' });
    }

    // Generate a 6-digit random code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    await Model.updateOne(
      { email: req.body.email },
      {
        resetCode,
        resetCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    );
    // const txtTamplate = textTemplate(user.name, resetCode);
    // const template = htmlTemplate(user.name, resetCode);

    // Send the reset code to the user's email via Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Use your email service provider
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Password Reset Code',
      text: `this is your reset code : ${resetCode}`
      // text: txtTamplate,
      // html: template,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ status: 'success', message: 'Password reset code sent to email' });
  } catch (err) {
    return res.status(500).json({ status: "fail", message: 'Server error' });
  }
}
//verify reset code 
const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  try {
    const Model = getModelByRole(req);
    // Check if the code matches the one sent to the email
    //1 get user from the db
    const user = await Model.findOne({ email });
    //2 check the code and expiration time
    if (user.resetCode === Number(code) && new Date() < user.resetCodeExpiresAt) {
      user.isResetCodeValide = true;
      await user.save({ validateBeforeSave: false })
      return res.status(200).json({ status: "success", message: 'Code verified successfully' });
    }
    return res.status(400).json({ status: "fail", message: 'Invalid code' });
  } catch (err) {
    return res.status(500).json({ status: 'fail', message: 'Server error' });
  }
}
//reset password function
const resetPassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;
  try {
    const Model = getModelByRole(req);
    const user = await Model.findOne({ email });

    if (!user) {
      return res.status(404).json({ status: "fail", message: 'user with that email not found' });
    }
    if (!user.isResetCodeValide) {
      return res.status(401).json({ status: "fail", message: 'reset code is not verified' });
    }
    // Update the user's password 
    user.password = newPassword;
    user.confirmPassword = confirmPassword;
    user.resetCode = null;
    user.resetCodeExpiresAt = null;
    user.isResetCodeValide = false;
    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;
    delete safeUser.resetCode;
    delete safeUser.resetCodeExpiresAt;
    delete safeUser.createdAt;
    delete safeUser.updatedAt;
    delete safeUser.__v;
    return res.status(200).json({ status: "success", message: 'Password reset successfully', user: safeUser });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ status: "fail", message: 'Server error' });
  }
}

// Protect Route
const protect = async (req, res, next) => {
  try {
    const Model = getModelByRole(req);
    // Get token from header

    const token = req.cookies.jwt;

    // Check token presence
    if (!token) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }
    // Verify token
    let decoded;
    try {
      decoded = await jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Your session has expired. Please log in again.', 401);
      }
      throw new AppError('Invalid token. Please log in again.', 401);
    }
    // Find user by decoded ID
    const freshUser = await Model.findById(decoded.id);
    if (!freshUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }
    // Check if user changed password
    if (freshUser.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('User recently changed password. Please log in again.', 401));
    }
    // Attach user to request
    req.user = freshUser;
    next();
  } catch (error) {
    next(error);
  }
};


// Restrict Access to Roles
const restrictTo = (...roles) => (req, res, next) => {
  try {

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { login, signup, logout, restrictTo, protect, createSendToken, signToken, sendResetCode, verifyResetCode, resetPassword, verifyEmail }