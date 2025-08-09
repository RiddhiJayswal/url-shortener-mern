// server/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { customAlphabet } from "nanoid";
import validUrl from "valid-url";
import Link from "./models/Link.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "*",
  })
);

const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const nanoid = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  7
);

// -------------------- routes--------------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

function sanitizeCode(code = "") {
  const cleaned = code.trim();
  if (!cleaned) return "";
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleaned)) return "";
  return cleaned;
}

app.post("/api/shorten", async (req, res) => {
  try {
    let { url, preferredCode } = req.body;

    // validate
    if (!url || !validUrl.isWebUri(url)) {
      return res
        .status(400)
        .json({ error: "Invalid URL. Must start with http:// or https://" });
    }
    url = url.trim();

    // reuse if same URL already stored
    const existing = await Link.findOne({ original_url: url });
    if (existing) {
      return res.json({
        short_code: existing.short_code,
        short_url: `${BASE_URL}/${existing.short_code}`,
        original_url: existing.original_url,
      });
    }

    // generate / accept preferred code
    let short_code = sanitizeCode(preferredCode) || nanoid();
    if (await Link.findOne({ short_code })) short_code = nanoid();

    const doc = await Link.create({ original_url: url, short_code });

    return res.status(201).json({
      short_code: doc.short_code,
      short_url: `${BASE_URL}/${doc.short_code}`,
      original_url: doc.original_url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/:shortcode", async (req, res) => {
  try {
    const link = await Link.findOne({ short_code: req.params.shortcode });
    if (!link) return res.status(404).send("Not found");

    link.visits += 1;
    await link.save();

    return res.redirect(302, link.original_url);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
// ----------------------------------------------------------------------

// connect DB THEN start server (after routes are defined)
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`API running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
