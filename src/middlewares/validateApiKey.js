import User from "../models/userModel.js"; // add `.js` if using ES modules
import express from "express"
export async function authenticateApiKey(req, res, next) {
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
    console.log(req.user);
    next();
  } catch (err) {
    console.error("API key auth error:", err);
    res.status(500).json({ error: "Server error during API key authentication" });
  }
}
