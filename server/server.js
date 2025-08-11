// server/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { customAlphabet } from "nanoid";
import validUrl from "valid-url";
import Link from "./models/Link.js";

dotenv.config();

/* ============================== Setup =============================== */

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const nanoid = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  7
);

// CORS: comma-separated list or "*"
const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(express.json());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: false,
  })
);

/* ============================ Utilities ============================= */

function sanitizeCode(code = "") {
  const cleaned = code.trim();
  if (!cleaned) return "";
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleaned)) return "";
  return cleaned;
}

function makeShortUrl(shortCode) {
  return `${BASE_URL}/${shortCode}`;
}

/* ============================== Routes ============================== */

// Root
app.get("/", (_req, res) => {
  res.send(
    "URL Shortener API is live ✅ Try: /api/health, /api/debug/db, /api/debug/count, /api/admin/links"
  );
});

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ------------------------------ Debug ------------------------------- */

// Which DB am I on?
app.get("/api/debug/db", (_req, res) => {
  const conn = mongoose.connection;
  const stateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({
    connected: conn?.readyState === 1,
    state: stateMap[conn?.readyState] ?? "unknown",
    host: conn?.host ?? null,
    name: conn?.name ?? null, // database name actually in use
  });
});

// Count docs in "links" collection
app.get("/api/debug/count", async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: "DB not ready yet" });
    const count = await db.collection("links").countDocuments();
    res.json({ links_count: count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to count documents" });
  }
});

// Create a test doc (optional)
app.post("/api/debug/create-test", async (_req, res) => {
  const doc = await Link.create({
    original_url: "https://example.org/" + Date.now(),
    short_code: nanoid(),
  });
  res.json({ inserted: doc._id, short_url: makeShortUrl(doc.short_code) });
});

/* --------------------------- Public API ----------------------------- */

// POST /api/shorten
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
        short_url: makeShortUrl(existing.short_code),
        original_url: existing.original_url,
      });
    }

    // generate / accept preferred code
    let short_code = sanitizeCode(preferredCode) || nanoid();
    if (await Link.exists({ short_code })) short_code = nanoid();

    const doc = await Link.create({ original_url: url, short_code });

    return res.status(201).json({
      short_code: doc.short_code,
      short_url: makeShortUrl(doc.short_code),
      original_url: doc.original_url,
    });
  } catch (err) {
    console.error("shorten error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /:shortcode -> redirect + atomic visit count
app.get("/:shortcode", async (req, res) => {
  try {
    const { shortcode } = req.params;
    const doc = await Link.findOneAndUpdate(
      { short_code: shortcode },
      { $inc: { visits: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).send("Not found");
    return res.redirect(302, doc.original_url);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

/* ------------------------------ Admin -------------------------------- */

// simple header auth
function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// GET /api/admin/links?page=&limit=
app.get("/api/admin/links", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);
  const page  = Math.max(parseInt(req.query.page || "1", 10), 1);
  const skip  = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Link.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Link.countDocuments()
  ]);

  res.json({
    page, limit, total,
    rows: rows.map(r => ({
      id: String(r._id),
      short_code: r.short_code,
      short_url: makeShortUrl(r.short_code),
      original_url: r.original_url,
      visits: r.visits || 0,
      createdAt: r.createdAt,
    }))
  });
});

// GET /api/admin/summary
app.get("/api/admin/summary", requireAdmin, async (_req, res) => {
  const [totalLinks, visitsAgg] = await Promise.all([
    Link.countDocuments(),
    Link.aggregate([{ $group: { _id: null, visits: { $sum: "$visits" } } }])
  ]);
  res.json({
    total_links: totalLinks,
    total_visits: visitsAgg[0]?.visits || 0
  });
});

// DELETE /api/admin/links/:id (single)
app.delete("/api/admin/links/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  await Link.deleteOne({ _id: id });
  res.json({ ok: true, deleted: id });
});

// DELETE /api/admin/links  { ids: [] } (bulk)
app.delete("/api/admin/links", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: "ids array required" });
  const result = await Link.deleteMany({ _id: { $in: ids } });
  res.json({ ok: true, deletedCount: result.deletedCount });
});

/* ============================ DB & Server ============================ */

async function start() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error("❌ MONGODB_URI is not set");
      process.exit(1);
    }

    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || "urlshortener",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    mongoose.connection.on("connected", () => {
      console.log(
        "✅ Mongo connected:",
        "db =", mongoose.connection.name,
        "host =", mongoose.connection.host
      );
    });
    mongoose.connection.on("error", (e) => console.error("❌ Mongo error", e));

    app.listen(PORT, () =>
      console.log(`🚀 API running on ${BASE_URL}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server", err);
    process.exit(1);
  }
}

start();
