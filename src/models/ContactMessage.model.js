import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["new", "read"], default: "new", index: true },
    sentEmail: {
      subject: { type: String, trim: true },
      body: { type: String, trim: true },
      sentAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model("ContactMessage", schema);
