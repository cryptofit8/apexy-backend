import dotenv from "dotenv";
dotenv.config();

try {
  dotenv.config();
} catch (error) {
  console.error("Error loading environment variables:", error);
  process.exit(1);
}

export const MONGO_URL = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`;
export const PORT = process.env.PORT
export const INDEXER_PORT = process.env.INDEXER_PORT
export const JWT_SECRET = process.env.JWT_SECRET || "JWT_SECRET";

export const CHAIN_LIST = ["ethereum", "polygon", "binance", "tron"];
// for testing : 180
export const UNIT = 180