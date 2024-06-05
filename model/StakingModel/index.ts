import mongoose from "mongoose";

const StakingSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  amount: { type: String, required: true },
  chainId: { type: Number, required: true },
  claimTime: { type: Number, required: true },
  count: { type: String, required: true },
  date: { type: Number, required: true },
  duration: { type: Number, required: true },
  reward: { type: String, default: "0" },
  unstaken: { type: Boolean, default: true },
});

const StakingModel = mongoose.model("staking", StakingSchema);

export default StakingModel;
