import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRouter from "./routes/authRoutes.js";
import modelRouter from "./routes/modelRoutes.js";
import { createServer } from "http";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
//cors
app.use(
  cors({
    origin: ["http://localhost:8080"], // remove trailing slashes
    credentials: true,
  })
);

// Middleware setup
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Mount routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/recommendations", modelRouter);

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).json({
    status: "fail",
    message: "Resource not found",
  });
});

// Global error handler (optional, centralized error handling)
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    status: "fail",
    message: err.message || "Server Error",
  });
});

export default httpServer;
