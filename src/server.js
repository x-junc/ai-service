import dotenv from 'dotenv';
import httpServer from './index.js'; // Import the app instance
import connectDB from './config/db.js'; // Database connection logic

// Load environment variables
dotenv.config();
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Connect to the database
    await connectDB();

    // Start the server with better error handling
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please try a different port.`);
        console.log(`💡 You can set a custom port using: PORT=3002 npm run dev`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err.message);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

// Start the app
startServer()
