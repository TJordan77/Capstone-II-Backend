// Server-Sent Events (SSE) (near-real-time, no extra infra)
// Why? Vercel has issues with being Serverless and having long-lived WebSocket connections
const clients = new Set();

// ADDED: mirror the exact-origin CORS from app.js (no wildcard)
const allowlist = new Set([
  "http://localhost:3000",
  process.env.FRONTEND_URL, // e.g. https://capstone-ii-frontend.vercel.app or whatever the current preview URL is
].filter(Boolean)); 
const vercelPreviewRe = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function sseMiddleware(req, res) {
  // ADDED: per-request CORS headers for SSE (must not be '*')
  const origin = req.headers.origin;
  if (origin && (allowlist.has(origin) || vercelPreviewRe.test(origin))) { 
    res.setHeader("Access-Control-Allow-Origin", origin); 
    res.setHeader("Access-Control-Allow-Credentials", "true"); 
    res.setHeader("Vary", "Origin"); 
  } 

  // Required SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // res.setHeader("X-Accel-Buffering", "no"); // ADDED (optional) dropping this here: disable proxy buffering if supported

  // CORS note: global CORS should already allow creds/origin
  res.flushHeaders?.(); // if compression is on, this helps

  clients.add(res);

  // keep-alive ping every 25s (helps through proxies)
  const interval = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(interval);
    clients.delete(res);
    try { res.end(); } catch {}
  });
}

function publish(event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  for (const res of clients) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(res);
      try { res.end(); } catch {}
    }
  }
}

module.exports = { sseMiddleware, publish };
