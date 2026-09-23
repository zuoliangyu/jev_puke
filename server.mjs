import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadDotEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const target =
  process.env.JEV_TARGET || "https://www.e-flowcode.cc/v1/systemone";
const model = process.env.JEV_MODEL || "jev-1.13";
const apiKey = process.env.JEV_API_KEY?.trim() || "";
const maxBodySize = 2 * 1024 * 1024;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodySize) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyJev(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS, POST",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "600",
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: { message: "Only POST is supported" } });
    return;
  }

  const authorization =
    req.headers.authorization || (apiKey ? `Bearer ${apiKey}` : "");
  if (!authorization) {
    json(res, 401, { error: { message: "Authorization header is required" } });
    return;
  }

  try {
    const body = await readBody(req);
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": req.headers["content-type"] || "application/json",
      },
      body,
    });
    const responseBody = await upstream.text();
    res.writeHead(upstream.status, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type":
        upstream.headers.get("content-type") ||
        "application/json; charset=utf-8",
    });
    res.end(responseBody);
    console.log(`[代理] POST /api/jev → ${upstream.status}`);
  } catch (error) {
    console.error(`[代理] 上游请求失败：${error.message}`);
    json(res, 502, { error: { message: `上游请求失败：${error.message}` } });
  }
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: { message: "Only GET and HEAD are supported" } });
    return;
  }

  const requestUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`,
  );
  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath =
    requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, filePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    json(res, 403, { error: { message: "Forbidden" } });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      json(res, 404, { error: { message: "Not found" } });
      return;
    }

    const headers = {
      "Cache-Control": "no-store",
      "Content-Length": stats.size,
      "Content-Type":
        mimeTypes[path.extname(filePath)] || "application/octet-stream",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const route = req.url?.split("?", 1)[0];
  if (route === "/api/status" && req.method === "GET") {
    json(res, 200, { live: Boolean(apiKey), model });
    return;
  }
  if (route === "/healthz" && req.method === "GET") {
    json(res, 200, { ok: true, live: Boolean(apiKey) });
    return;
  }
  if (route === "/api/jev") {
    proxyJev(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`JEV 本地服务：http://${host}:${port}`);
  console.log(`Jev 代理目标：${target}`);
  console.log(
    `Jev API Key：${apiKey ? "已配置（仅服务端）" : "未配置，等待页面临时 Key"}`,
  );
});
