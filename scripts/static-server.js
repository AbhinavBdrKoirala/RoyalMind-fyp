const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "client");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain"
};

function send(res, status, body, type = "text/plain") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

http.createServer((req, res) => {
  const baseUrl = `http://${req.headers.host || "localhost"}`;
  const parsedUrl = new URL(req.url, baseUrl);
  let pathname = decodeURIComponent(parsedUrl.pathname || "/");

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.join(root, pathname);

  if (!filePath.startsWith(root)) {
    return send(res, 403, "Forbidden");
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return send(res, 404, "Not found");
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      if (fs.existsSync(indexPath)) {
        return fs.createReadStream(indexPath)
          .on("error", () => send(res, 500, "Server error"))
          .pipe(res);
      }
      return send(res, 403, "Forbidden");
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath)
      .on("error", () => send(res, 500, "Server error"))
      .pipe(res);
  });
}).listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});
