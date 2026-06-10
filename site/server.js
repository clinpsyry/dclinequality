// Minimal static file server for local preview/testing of the explorer.
// Run via .claude/launch.json (preview_start "site"). Serves this directory.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const PORT = 8137;
const TYPES = { ".html": "text/html", ".js": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".map": "application/json",
  ".woff2": "font/woff2" };

http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  var fp = path.join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fp, function (err, data) {
    if (err) { res.writeHead(404); res.end("not found: " + p); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(fp)] || "application/octet-stream",
      // Local preview: never cache, so edits always load on refresh.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache", "Expires": "0"
    });
    res.end(data);
  });
}).listen(PORT, function () { console.log("explorer serving on http://localhost:" + PORT); });
