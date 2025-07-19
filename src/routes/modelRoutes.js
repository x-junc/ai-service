import dotenv from 'dotenv';
dotenv.config();
import express from "express"
import { getContactByDB, getContactByDBBulk, getContactsByPdf, getContactsByPdfBulk, getContactsByPdfTST, getRecommendationPropertyComparison, getPropertyRecommendations } from '../controllers/modelControllers.js'
import { protect } from '../controllers/authControllers.js'
import { authenticateApiKey } from "../middlewares/validateApiKey.js"
import upload from "../middlewares/multer.js"

const Router = express.Router();

// Add debugging middleware to log all requests
Router.use((req, res, next) => {
  console.log("🔍 Route hit:", req.method, req.path);
  console.log("🔍 Full URL:", req.originalUrl);
  console.log("🔍 Headers:", req.headers);

  // Add response debugging
  const originalSend = res.send;
  res.send = function (data) {
    console.log("📤 Response being sent:", typeof data, data ? data.substring(0, 200) + "..." : "null");
    return originalSend.call(this, data);
  };

  next();
});

Router.post("/with-pdf-tst", upload.single("pdf"), getContactsByPdfTST)
Router.post("/with-pdf", authenticateApiKey, getContactsByPdf) // pdf
Router.post("/with-pdf-bulk", authenticateApiKey, getContactsByPdfBulk) // pdf bulk
Router.post("/property-comparison", getRecommendationPropertyComparison) // property comparison
Router.post("/property/:id", getContactByDB)// db
Router.post("/property-bulk", getContactByDBBulk) // db bulk
Router.post("/property-recommendations", authenticateApiKey, getPropertyRecommendations) // property recommendations based on user preferences



export default Router