import mongoose from "mongoose";

const TradingSchema = new mongoose.Schema({
  coin: { type: String, required: true },
  profit: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const TradingModel = mongoose.model("trading", TradingSchema);

export default TradingModel;
