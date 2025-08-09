// Server‑Sent Events (SSE) (near‑real‑time, no extra infra)
// Why? Vercel has issues with being Serverless and having long‑lived WebSocket connections
const clients = new Set();

function sseMiddleware(req, res) {
  // Required SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

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
