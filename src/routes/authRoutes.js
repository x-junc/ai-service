import dotenv from 'dotenv';
dotenv.config();
import express from "express"
import { login, signup, logout, sendResetCode, verifyResetCode, resetPassword, protect, getApiKey } from '../controllers/authControllers.js'
const Router = express.Router();


// Admin routes
Router.route('/signup').post(signup);
Router.route('/login').post(login);
Router.route('/logout').get(protect, logout);
Router.route('/apiKey').post(protect, getApiKey);
Router.route('/forgot-password').post(sendResetCode);
Router.route('/verify-reset-code').post(verifyResetCode);
Router.route('/reset-password').post(resetPassword);


export default Router;