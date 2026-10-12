// Vercel serverless function: keeps one copy of The Shelf's personal data (tags, copies, watches,
// posters, double features…) so it survives a reinstall or a new phone.
//
// Storage: Upstash Redis, connected in Vercel → Project → Storage. The integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN); either pair works.
//
// Access: a passphrase sent in the x-shelf-pass header. The first passphrase ever used claims the
// store; after that only the same passphrase can read or write. Only a salted hash is stored.

import { createHash } from "node:crypto";

const URL_ = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
const TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Storage error (${r.status})`);
  return j.result;
}

const hashOf = (pass) => createHash("sha256").update("theshelf:v1:" + pass).digest("hex");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(503).json({ error: "Sync storage isn't connected yet. In Vercel, add an Upstash Redis database to this project." });

  const pass = String(req.headers["x-shelf-pass"] || "");
  if (pass.length < 8) return res.status(401).json({ error: "Enter a passphrase of at least 8 characters." });

  try {
    const hash = hashOf(pass);
    let owner = await redis(["GET", "shelf:owner"]);
    if (!owner) {
      await redis(["SET", "shelf:owner", hash, "NX"]);
      owner = await redis(["GET", "shelf:owner"]);
    }
    if (owner !== hash) return res.status(403).json({ error: "That passphrase doesn't match the one this Shelf was set up with." });

    const raw = await redis(["GET", "shelf:data"]);
    const current = raw ? JSON.parse(raw) : null;

    if (req.method === "GET") return res.status(200).json({ doc: current });

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!body.data || typeof body.data !== "object") return res.status(400).json({ error: "Nothing to save." });
      // Someone else (another device) saved since this one last synced: send theirs back to merge.
      if (current && body.base !== current.version) return res.status(409).json({ error: "Changed elsewhere.", doc: current });
      const next = { data: body.data, version: (current?.version || 0) + 1, updatedAt: Date.now(), device: String(body.device || "").slice(0, 40) };
      const json = JSON.stringify(next);
      if (json.length > 900_000) return res.status(413).json({ error: "Your data is too large to sync (over 900 KB)." });
      await redis(["SET", "shelf:data", json]);
      // Keep the previous copy too, in case a bad save needs undoing.
      if (raw) await redis(["SET", "shelf:data:prev", raw]);
      return res.status(200).json({ version: next.version, updatedAt: next.updatedAt });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Use GET or PUT." });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Sync storage didn't respond." });
  }
}
