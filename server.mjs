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
// 页面可以切换服务商，但代理只转发到白名单内的主机，避免变成开放代理。
const allowedHosts = new Set(
  [
    "www.e-flowcode.cc",
    "e-flowcode.cc",
    "api.typesafe.ai",
    new URL(target).host,
    ...(process.env.JEV_ALLOWED_HOSTS || "").split(","),
  ]
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Jev-Target",
    "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// 页面自带 Key 时才允许改写目标；服务端 Key 只发往 JEV_TARGET。
function resolveTarget(req) {
  const requested = String(req.headers["x-jev-target"] || "").trim();
  if (!requested || !req.headers.authorization) return target;
  let url;
  try {
    url = new URL(requested);
  } catch {
    throw Object.assign(new Error("Endpoint 不是合法的 URL"), { status: 400 });
  }
  if (url.protocol !== "https:" || !allowedHosts.has(url.host.toLowerCase())) {
    throw Object.assign(
      new Error(`Endpoint 主机 ${url.host} 不在代理白名单内（可用 JEV_ALLOWED_HOSTS 追加）`),
      { status: 403 },
    );
  }
  return url.href;
}

// …/v1/systemone → …/v1/models
function modelsUrl(endpoint) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/[^/]*\/?$/, "/models");
  url.search = "";
  return url.href;
}

// 兼容官方 {models:[{name}]} 与 OpenAI 风格 {data:[{id}]}
function normalizeModels(payload) {
  const list = Array.isArray(payload?.models)
    ? payload.models
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];
  return list
    .map((item) =>
      typeof item === "string"
        ? { id: item, description: "" }
        : {
            id: String(item?.name || item?.id || ""),
            description: String(item?.description || item?.owned_by || ""),
          },
    )
    .filter((item) => item.id);
}

// 网络抖动、429 限流、529 过载按官方建议指数退避重试，其余状态直接返回
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (attempt >= retries || (response.status !== 429 && response.status !== 529))
        return response;
      console.warn(`[代理] 上游 ${response.status}，第 ${attempt + 1} 次重试`);
    } catch (error) {
      if (attempt >= retries) throw error;
      console.warn(`[代理] 上游请求失败（${error.message}），第 ${attempt + 1} 次重试`);
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
  }
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
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Jev-Target",
      "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
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

  let upstreamTarget;
  try {
    upstreamTarget = resolveTarget(req);
  } catch (error) {
    json(res, error.status || 400, { error: { message: error.message } });
    return;
  }

  try {
    const body = await readBody(req);
    const upstream = await fetchWithRetry(upstreamTarget, {
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
    console.log(
      `[代理] POST /api/jev → ${new URL(upstreamTarget).host} ${upstream.status}`,
    );
  } catch (error) {
    console.error(`[代理] 上游请求失败：${error.message}`);
    json(res, 502, { error: { message: `上游请求失败：${error.message}` } });
  }
}

async function proxyModels(req, res) {
  const authorization =
    req.headers.authorization || (apiKey ? `Bearer ${apiKey}` : "");
  if (!authorization) {
    json(res, 401, { error: { message: "需要 API Key 才能获取模型列表" } });
    return;
  }

  let url;
  try {
    url = modelsUrl(resolveTarget(req));
  } catch (error) {
    json(res, error.status || 400, { error: { message: error.message } });
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    console.log(`[代理] GET /api/models → ${new URL(url).host} ${upstream.status}`);
    if (!upstream.ok) {
      const message =
        payload?.error?.message ||
        payload?.detail?.message ||
        (typeof payload?.detail === "string" ? payload.detail : "") ||
        text.slice(0, 200) ||
        upstream.statusText;
      json(res, upstream.status, { error: { message } });
      return;
    }
    json(res, 200, { source: url, models: normalizeModels(payload) });
  } catch (error) {
    json(res, 502, { error: { message: `获取模型失败：${error.message}` } });
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
  if (route === "/api/models" && (req.method === "GET" || req.method === "OPTIONS")) {
    if (req.method === "OPTIONS") proxyJev(req, res);
    else proxyModels(req, res);
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
