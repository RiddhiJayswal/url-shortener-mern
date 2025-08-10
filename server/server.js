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

// POST /api/shorten
app.post("/api/shorten", async (req, res) => {
  if (existing) {
    return res.json({
      short_code: existing.short_code,
      short_url: makeShortUrl(existing.short_code),
      original_url: existing.original_url,
    });
  }
  const doc = await Link.create({ original_url: url, short_code });
  return res.status(201).json({
    short_code: doc.short_code,
    short_url: makeShortUrl(doc.short_code),
    original_url: doc.original_url,
  });
});


/* --------------------------- Utility / Root route --------------------------- */
app.get("/", (_req, res) => {
  res.send(
    "URL Shortener API is live ✅ Try: /api/health, /api/debug/db, /api/debug/count, /api/admin/links"
  );
});

/* --------------------------------- Debug ---------------------------------- */
app.get("/api/debug/db", (_req, res) => {
  const conn = mongoose.connection;
  const stateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({
    connected: conn?.readyState === 1,
    state: stateMap[conn?.readyState] ?? "unknown",
    host: conn?.host ?? null,
    name: conn?.name ?? null, // <-- database name actually in use
  });
});

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

// Quick admin view (development only)
// GET /api/admin/links
app.get("/api/admin/links", async (req, res) => {
  const rows = await Link.find()
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    rows: rows.map(r => ({
      id: r._id,
      createdAt: r.createdAt,
      original_url: r.original_url,
      visits: r.visits,
      short_code: r.short_code,
      short_url: makeShortUrl(r.short_code), 
    })),
  });
});


/* --------------------------------- API ------------------------------------ */
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

/* ----------------------- Connect DB THEN start server ---------------------- */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    console.log("DB Name:", mongoose.connection.name);
    console.log("Host   :", mongoose.connection.host);
    app.listen(PORT, () => console.log(`API running  on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });



// --- admin auth (very simple API-key) ---
function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- list links with pagination ---
app.get("/api/admin/links", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const page  = Math.max(parseInt(req.query.page || "1", 10), 1);
  const skip  = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Link.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Link.countDocuments()
  ]);

  const base = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");

  res.json({
    page, limit, total,
    rows: rows.map(r => ({
      id: String(r._id),
      short_code: r.short_code,
      short_url: `${base}/${r.short_code}`,   // <-- add this
      original_url: r.original_url,
      visits: r.visits || 0,
      createdAt: r.createdAt,
    }))
  });
});


// --- totals ---
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
