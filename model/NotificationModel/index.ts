import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

const NotificationModel = mongoose.model("notification", NotificationSchema);

export default NotificationModel;
