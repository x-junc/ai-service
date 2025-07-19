import dotenv from 'dotenv';
dotenv.config();
import { initializeRag, askQuestion, initializeRagFromDb, initializeRagFromDbBulk, askQuestionBulk, initializeRagBulk, askQuestionComparison, initializeRagForComparison, getRecommendationsForUser } from "../rag-file.js"
import AppError from '../utils/AppError.js';
import crypto from "crypto";
import User from "../models/userModel.js"
import axios from "axios";
import { generateComparisonPDF } from '../utils/pdfGenerator.js';
const algorithm = 'aes-256-cbc'; // Match your encryption algorithm
const secretKey = process.env.ENCRYPTION_KEY; // Should be 32 characters

const decrypt = (text) => {
  if (!text) throw new Error("No text provided for decryption");
  try {
    console.log("🔐 Inside decrypt");
    const parts = text.split(":");
    if (parts.length !== 2) throw new Error("Invalid encrypted format");

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const key = Buffer.from(secretKey, "utf-8");

    if (key.length !== 32) {
      throw new Error("Encryption key must be 32 bytes for AES-256-CBC");
    }

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  } catch (err) {
    console.error("❌ Decryption failed:", err.message);
    throw err; // ⛔ Always re-throw or return useful error
  }
};


export const getContactsByPdf = async (req, res, next) => {
  try {
    console.log("entering1");
    const { number, proprety, pdfBuffer } = req.body;

    if (!pdfBuffer) {
      return next(new AppError("❌ PDF data (base64) missing", 400));
    }

    let propertyObj;
    try {
      propertyObj = typeof proprety === 'string' ? JSON.parse(proprety) : proprety;
    } catch {
      return next(new AppError("❌ Invalid property JSON", 400));
    }

    const pdfBufferDecoded = Buffer.from(pdfBuffer, "base64");

    // Make sure initializeRag works with a buffer
    await initializeRag(pdfBufferDecoded, propertyObj);

    const result = await askQuestion(Number(number) || 5);

    res.status(200).json({ status: "success", result });
  } catch (err) {
    console.error(err);
    next(new AppError(err.message || "Server error", 500));
  }
};

export const getContactsByPdfBulk = async (req, res, next) => {
  try {
    console.log("entering1 - Bulk");
    const { number, proprety, pdfBuffer } = req.body;

    if (!pdfBuffer) {
      return next(new AppError("❌ PDF data (base64) missing", 400));
    }

    let propertyObj;
    try {
      propertyObj = typeof proprety === 'string' ? JSON.parse(proprety) : proprety;
    } catch {
      return next(new AppError("❌ Invalid property JSON", 400));
    }

    // Validate that propertyObj is an array for bulk processing
    if (!Array.isArray(propertyObj) || propertyObj.length === 0) {
      return next(new AppError("❌ proprety must be a non-empty array for bulk processing", 400));
    }

    const pdfBufferDecoded = Buffer.from(pdfBuffer, "base64");

    // Use bulk function for multiple properties
    await initializeRagBulk(pdfBufferDecoded, propertyObj);
    const result = await askQuestionBulk(Number(number) || 5);
    res.status(200).json({ status: "success", result });
  } catch (err) {
    console.error(err);
    next(new AppError(err.message || "Server error", 500));
  }
};



export const getRecommendationPropertyComparison = async (req, res, next) => {
  try {
    console.log("inside getRecommendationPropertyComparison");
    const { propertyA, propertyB, clientInfoJson, agentRemarks } = req.body;

    // Validate required fields
    if (!propertyA || !propertyB) {
      return res.status(400).json({
        msg: "Both propertyA and propertyB are required"
      });
    }
    console.log("okk");
    // Validate property objects
    if (!propertyA.address || !propertyA.price || !propertyA.property_type ||
      !propertyB.address || !propertyB.price || !propertyB.property_type) {
      return res.status(400).json({
        msg: "Both properties must have address, price, and property_type"
      });
    }
    console.log("okk0");
    // Validate clientInfo and agentRemarks (optional but good to check)
    if (!clientInfoJson) {
      return res.status(400).json({
        msg: "clientInfoJson is required"
      });
    }
    console.log("okk1");

    // Call initializeRagForComparison with the two properties and client info
    await initializeRagForComparison(propertyA, propertyB, clientInfoJson, agentRemarks);
    console.log("okk2");
    // Call askQuestionComparison to get the comparison result
    const result = await askQuestionComparison();
    console.log("okk3");

    // Generate PDF from the comparison result
    const pdfBuffer = await generateComparisonPDF(result);
    console.log("okk4");

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="property-comparison-report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Send the PDF buffer as response
    res.status(200).send(pdfBuffer);

    // Alternative: If you want base64 PDF instead, uncomment these lines:
    // const base64PDF = pdfBuffer.toString('base64');
    // res.status(200).json({
    //   status: "success",
    //   pdfBase64: base64PDF,
    //   filename: "property-comparison-report.pdf",
    //   propertiesCompared: 2
    // });
  } catch (err) {
    console.log("❌ Error:", err.message);
    next(err);
  }
};





export const getContactByDB = async (req, res, next) => {
  try {
    // validate api key 
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(403).json({ error: "Invalid API key" });
    }
    req.user = user; // attach user to the request
    // start using ai 
    console.log("entering2");
    const { number } = req.body // must send req.file when fetching
    const propID = req.params.id
    console.log(req.body);
    console.log(req.user.mongoUriEncrypted);
    await initializeRagFromDb(req.user.mongoUriEncrypted, propID)
    console.log("mrigla2");
    const result = await askQuestion(parseInt(number))
    res.status(200).json({ status: "success", data: result })
  } catch (err) {
    next(new AppError(err.msg, 400))
  }
}

export const getContactByDBBulk = async (req, res, next) => {
  try {
    // validate api key 
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(403).json({ error: "Invalid API key" });
    }
    req.user = user; // attach user to the request
    // start using ai 
    console.log("entering2 - Bulk");
    const { number, propertyIds } = req.body // propertyIds should be an array of property IDs
    console.log(req.body);
    console.log(req.user.mongoUriEncrypted);

    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return next(new AppError("Property IDs array is required", 400));
    }

    // Use bulk function for multiple properties
    await initializeRagFromDbBulk(req.user.mongoUriEncrypted, propertyIds)
    console.log("mrigla2");
    const result = await askQuestionBulk(parseInt(number))
    res.status(200).json({ status: "success", data: result })
  } catch (err) {
    next(new AppError(err.message || err.msg, 400))
  }
}

export const getContactsByPdfTST = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(403).json({ error: "Invalid API key" });
    }
    req.user = user; // attach user to the request
    const { number, proprety } = req.body;
    console.log(proprety);
    if (!req.file) return next(new AppError("❌ PDF file missing", 400));

    let propertyObj;
    try {
      propertyObj = JSON.parse(proprety);
      console.log(propertyObj);
    } catch {
      return next(new AppError("❌ Invalid property JSON", 400));
    }

    await initializeRag(req.file, propertyObj); // you'll need to update initializeRag to accept a buffer
    const result = await askQuestion(Number(number));

    res.status(200).json({ status: "success", result });
  } catch (err) {
    console.error(err);
    next(new AppError("Server error", 500));
  }
};

// Get property recommendations based on user preferences
export const getPropertyRecommendations = async (req, res, next) => {
  try {
    console.log("🚀 Starting property recommendations for user...");

    // Validate API key
    const apiKey = req.headers["x-api-key"];
    console.log("🔑 API Key received:", apiKey ? "Yes" : "No");

    if (!apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const user = await User.findOne({ apiKey });
    console.log("👤 User found:", user ? "Yes" : "No");

    if (!user) {
      return res.status(403).json({ error: "Invalid API key" });
    }
    req.user = user;

    const { clientId } = req.body;
    console.log("📋 Request body:", req.body);

    if (!clientId) {
      return res.status(400).json({
        status: "error",
        message: "clientId is required"
      });
    }

    console.log("📋 Client ID received:", clientId);

    console.log("🔗 Mongo URI available:", req.user.mongoUriEncrypted ? "Yes" : "No");

    // Get recommendations using RAG system
    const recommendations = await getRecommendationsForUser(clientId, req.user.mongoUriEncrypted);
    console.log("✅ Recommendations generated successfully");
    console.log(recommendations);

    // Add cache control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    console.log(recommendations);
    res.status(200).json({
      status: "success",
      data: recommendations
    });

  } catch (err) {
    console.log("❌ Error:", err.message);
    console.log("❌ Error stack:", err.stack);

    // Create a clean error object without circular references
    const cleanError = {
      message: err.message || "Server error",
      stack: err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : undefined
    };

    next(new AppError(cleanError.message, 500));
  }
};

