import mongoose from "mongoose";

const VoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  chainId: { type: Number, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  startTime: { type: Number, required: true },
  duration: { type: Number, required: true },
  level: { type: Number, required: true },
  count: { type: Number, required: true },
  totalUser: { type: Number, required: true },
  yes: [String],
  no: [String],
});

const VoteModel = mongoose.model("vote", VoteSchema);

export default VoteModel;
