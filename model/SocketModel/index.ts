import mongoose from "mongoose";

const SocketSchema = new mongoose.Schema({
  userId:{type: String, required: true},
  evm:{type: String, required: true},
  tron:{type: String, required: true},
  socketId:{type: String, required: true},
})

const SocketModel = mongoose.model("socket", SocketSchema);

export default SocketModel;