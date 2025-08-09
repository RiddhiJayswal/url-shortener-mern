import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    original_url: { type: String, required: true },
    short_code: { type: String, required: true, unique: true, index: true },
    visits: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("Link", linkSchema);
