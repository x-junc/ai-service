import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import AppError from '../utils/AppError.js';
import dotenv from "dotenv";
import streamifier from 'streamifier';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();
cloudinary.config({
  cloud_name: process.env.APP_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.APP_CLOUDINARY_API_KEY,
  api_secret: process.env.APP_CLOUDINARY_SECRET_KEY,
});

exports.uploadMultiple = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return next();

    const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            public_id: `multi_uploads/${uuidv4()}`,
            quality: 'auto'
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );

        streamifier.createReadStream(fileBuffer).pipe(stream);
      });
    };

    const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
    const imageUrls = await Promise.all(uploadPromises);

    req.images = imageUrls; // array of Cloudinary URLs
    next();

  } catch (err) {
    console.error(err);
    next(new AppError(err.message || 'Multiple image upload failed', 400));
  }
};

exports.uploadSingle = async (req, res, next) => {
  try {
    if (!req.file) return next(); // No image uploaded

    const streamUpload = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            public_id: `store_images/${uuidv4()}` // Optional folder/name
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(fileBuffer).pipe(stream);
      });
    };

    const result = await streamUpload(req.file.buffer);

    req.image = result.secure_url; // ✅ Cloudinary image URL
    next();

  } catch (err) {
    console.error(err);
    next(new AppError(err.message || "Image upload failed", 400));
  }
};


exports.uploadFile = async (filePath) => {
  try {
    if (!filePath) {
      throw new AppError("file does not exists", 404);
    }
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "auto"
    });

    imageURL = result.secure_url; // Store image URL in request
    return imageURL
  } catch (err) {
    console.log(err);
    throw new AppError(err.message || "Image upload failed", 400);
  }
};
// module.exports = uploadMultiple;