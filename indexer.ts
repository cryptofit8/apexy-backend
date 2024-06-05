import { watchEthereum, watchPolygon } from './traceTx';
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { INDEXER_PORT, connectDb as connectMongoDB } from "./config";
import http from "http";
import cronjob from './cron';
import socketio from "./socket";

// Load environment variables from .env file
dotenv.config();

// Connect to the MongoDB database
connectMongoDB();

// Create an instance of the Express application
const app = express();

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors());

// Parse incoming JSON requests using body-parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);

// Socket communication
socketio(server)
console.log("Socket communication started")

// Cron job
cronjob.start()
console.log("Cron job is running")

watchEthereum()
watchPolygon()

// Define a route to check if the backend server is running
app.get("/", async (req: any, res: any) => {
  res.send("Apex Indexer is Running now!");
});

// Start the Express server to listen on the specified port
server.listen(INDEXER_PORT, () => {
  console.log(`Apex Indexer is running on port ${INDEXER_PORT}`);
});
