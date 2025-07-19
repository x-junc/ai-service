// utils/upload.js
import multer from 'multer';
const storage = multer.memoryStorage(); // Must be memoryStorage!
const upload = multer({ storage });
export default upload;
