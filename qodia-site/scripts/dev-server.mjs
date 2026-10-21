// Serveur local : sert dist/ avec des URL propres et exécute api/lead.js.
// Usage : node scripts/build.mjs && node scripts/dev-server.mjs  (http://localhost:3000)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };
const { default: lead } = await import(path.join(ROOT, "api/lead.js"));
async function exists(p) { try { return (await stat(p)).isFile(); } catch { return false; } }
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/lead") return lead(req, res);
  let p = decodeURIComponent(url.pathname);
  const candidates = [p, p + ".html", path.join(p, "index.html"), p === "/" ? "/index.html" : null].filter(Boolean);
  for (const c of candidates) {
    const f = path.join(DIST, c);
    if (f.startsWith(DIST) && await exists(f)) { res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); return res.end(await readFile(f)); }
  }
  res.writeHead(404, { "Content-Type": TYPES[".html"] }); res.end(await readFile(path.join(DIST, "404.html")));
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
