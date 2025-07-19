// authControllers.js
import dotenv from 'dotenv';
dotenv.config();
import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

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
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    if (!email || !password || !name || !confirmPassword) return res.status(400).json({ error: 'Missing data' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Already registered' });

    const user = new User({ email, name, password, confirmPassword });
    await user.save();

    res.status(201).json({ status: "success", data: user });
  } catch (err) {
    next(new AppError(err.message, 400))
  }
};
//generate api key 
const SECRET = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();

function encrypt(text) {
  const cipher = crypto.createCipheriv('aes-256-cbc', SECRET, Buffer.alloc(16, 0));
  return cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}
export const getApiKey = async (req, res, next) => {
  try {
    const { mongoUri } = req.body;
    const userId = req.user._id
    if (!mongoUri) return res.status(400).json({ error: 'Missing data' });
    const mongoUriEncrypted = mongoUri
    const apiKey = crypto.randomBytes(32).toString('hex');
    const user = await User.findByIdAndUpdate(userId, { mongoUriEncrypted, apiKey })
    console.log(user);
    res.status(201).json({ status: "success", apiKey });
  } catch (err) {
    if (req.headers["x-api-key"] !== validKey) {
      return res.status(401).json({ msg: "Unauthorized" });
    }
    next(new AppError(err.message, 400))
  }
};

// User Login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // Check email and password
    if (!email || !password) {
      throw new AppError('Please provide email and password', 400);
    }

    // Find user and include password field
    const user = await User.findOne({ email })
    // Verify user and password
    if (!user || !(await user.correctPassword(password, user.password))) {
      throw new AppError('Please provide correct email or password', 400);
    }
    // Send token to user
    createSendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

export const logout = (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // use 'true' in production
    sameSite: 'Strict', // or 'Lax' depending on your frontend setup
  });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};


//forgot password function
export const sendResetCode = async (req, res, next) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ status: 'fail', message: 'Email not found' });
    }

    // Generate a 6-digit random code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    await User.updateOne(
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
    console.log(err.message);
    return res.status(500).json({ status: "fail", message: 'Server error' });
  }
}
//verify reset code 
export const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  try {

    // Check if the code matches the one sent to the email
    //1 get user from the db
    const user = await User.findOne({ email });
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
export const resetPassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;
  try {

    const user = await User.findOne({ email });

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
export const protect = async (req, res, next) => {
  try {
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
    const freshUser = await User.findById(decoded.id);
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
export const restrictTo = (...roles) => (req, res, next) => {
  try {

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  } catch (error) {
    next(error);
  }
};

