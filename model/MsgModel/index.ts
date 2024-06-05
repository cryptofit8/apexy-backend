import mongoose from "mongoose";

const MsgSchema = new mongoose.Schema({
  userId: { type: String, require: true },
  message: { type: String, require: true },
  time: { type: Date, default: Date.now() },
});

const MsgModel = mongoose.model("msg", MsgSchema);

export default MsgModel;
