import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from 'path';
import { PORT, connectDb as connectMongoDB } from "./config";
import User from "./routes/UserRoute";
import WalletRouter from "./routes/WalletRoute";
import ContractRouter from "./routes/ContractRoute";
import http from "http";
import AdminRouter from "./routes/AdminRoute";

// Load environment variables from .env file
dotenv.config();

// Connect to the MongoDB database
connectMongoDB();

// Create an instance of the Express application
const app = express();

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, './public')));

// Parse incoming JSON requests using body-parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);

// Define routes for different API endpoints
app.use("/api/users", User);
app.use("/api/wallet", WalletRouter);
app.use("/api/contract", ContractRouter);
app.use("/api/admin", AdminRouter);

// Define a route to check if the backend server is running
app.get("/", async (req: any, res: any) => {
  res.send("Apex Backend Server is Running now!");
});

// Start the Express server to listen on the specified port
server.listen(PORT, () => {
  console.log(`Apex server is running on port ${PORT}`);
});