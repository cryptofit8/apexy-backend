import mongoose from "mongoose";

const LevelSchema = new mongoose.Schema({
  userId: { type: String, require: true, unique: true },
  userLevel: {
    ethereum: {
      type: Number,
      default: 0,
    },
    polygon: {
      type: Number,
      default: 0,
    },
    binance: {
      type: Number,
      default: 0,
    },
    tron: {
      type: Number,
      default: 0,
    },
  },
  referLevel: {
    ethereum: {
      type: Number,
      default: 0,
    },
    polygon: {
      type: Number,
      default: 0,
    },
    binance: {
      type: Number,
      default: 0,
    },
    tron: {
      type: Number,
      default: 0,
    },
  },
});

const LevelModel = mongoose.model("level", LevelSchema);

export default LevelModel;
