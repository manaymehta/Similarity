import dotenv from 'dotenv';
import connectDB from './config/db.js';
import app from './app.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
};

startServer();

// app is seperated from index.ts to make it easier to test.
// This allows testing libraries like supertest to simulate HTTP requests against the
// app instance directly in memory, without the overhead of opening a network socket.
// in simple words, we can test the app without starting the server.