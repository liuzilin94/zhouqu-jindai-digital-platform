"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.JINDAI_DATA_DIR || path.join(ROOT, "data"));
const DB_FILE = path.join(DATA_DIR, "jindai.sqlite");
const HOST = process.env.JINDAI_HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8766);
const MAX_BODY = 1024 * 1024;
const COOKIE_NAME = "jindai_sid";
const SESSION_AGE = 365 * 24 * 60 * 60;
const ADMIN_TOKEN = process.env.JINDAI_ADMIN_TOKEN || "";
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon" };

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS motifs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, image TEXT NOT NULL, source_path TEXT NOT NULL, source_url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', meaning TEXT NOT NULL DEFAULT '', rights_status TEXT NOT NULL DEFAULT 'pending', verification_status TEXT NOT NULL DEFAULT 'pending', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, image TEXT NOT NULL, summary TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', era TEXT NOT NULL DEFAULT '', material TEXT NOT NULL DEFAULT '', dimensions TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', rights_status TEXT NOT NULL DEFAULT 'pending', verification_status TEXT NOT NULL DEFAULT 'pending', is_demo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY, name TEXT NOT NULL, image TEXT NOT NULL, description TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS craft_steps (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, action TEXT NOT NULL, source TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS designs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, title TEXT NOT NULL, cells_json TEXT NOT NULL, palette INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS designs_session_updated ON designs(session_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS weave_progress (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, progress_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "motifs", "source.json"), "utf8"));
const motifCount = db.prepare("SELECT COUNT(*) AS n FROM motifs").get().n;
if (!motifCount) {
  const insert = db.prepare("INSERT INTO motifs(id,title,kind,image,source_path,source_url) VALUES(?,?,?,?,?,?)");
  for (const m of manifest.items) insert.run(m.id, `纹样 ${String(m.id).padStart(2, "0")}`, m.category, `/assets/motifs/${m.file}`, m.sourcePath, manifest.repository);
}
const demoArchives = [
  ["实物", "几何菱花纹锦带", "archive-photo", "多色纱线交织形成连续几何结构。图片仅作页面演示。", "纹样 实物 菱形 几何"],
  ["纹样", "莲花菱形纹", "archivePattern", "重复与对称的图形结构，可用于观察纹样节奏。", "纹样 菱形 花形"],
  ["工艺", "手工织带工具", "archiveTool", "呈现传统织带所用的木质工具与线组。", "工艺 工具 木质"],
  ["传承人", "织带人的故事", "archiveMaker", "传承人影像与口述档案的展示位置。", "传承人 口述 影像"],
  ["纹样", "花形几何组合", "cultureMain", "从实物局部放大，查看色彩与构图。", "纹样 花形 色彩"],
  ["工艺", "第一视角织造", "weave", "观察腰脚固定、彩线排列及操作视角。", "工艺 经线 织造"]
];
if (!db.prepare("SELECT COUNT(*) AS n FROM archives").get().n) {
  const insert = db.prepare("INSERT INTO archives(kind,title,image,summary,tags,source) VALUES(?,?,?,?,?,?)");
  for (const row of demoArchives) insert.run(...row, "原型演示素材，待核验");
}
const chapterSeed = [
  ["序厅 · 锦带之美", "gallery-photo", "从代表锦带进入展览，认识不同用途和视觉风格。"],
  ["代表锦带", "archive-photo", "近距离观察纹样、配色与织物细节。"],
  ["织造工具", "gallery-tools", "观察手工织造所使用的工具及其功能。"],
  ["传承故事", "gallery-story", "通过口述与影像了解织带人的经历。"],
  ["当代新生", "model-photo", "看看传统纹样如何进入当代生活。"],
  ["沉浸影像", "weave-photo", "以第一视角理解锦带制作过程。"]
];
if (!db.prepare("SELECT COUNT(*) AS n FROM chapters").get().n) {
  const insert = db.prepare("INSERT INTO chapters(id,name,image,description) VALUES(?,?,?,?)");
  chapterSeed.forEach((row, i) => insert.run(i + 1, ...row));
}
const stepSeed = [
  ["摆放工具", "文献先铺设木制支撑、挑线用“用叉”和压线用“打玛”等工具；在画面中辨认各自的位置。", "进入拉线"],
  ["拉线（布线）", "按照预定图案往返排列彩线，形成线组；线组数量与锦带宽度有关，此处仅演示变化趋势。", "完成拉线示意"],
  ["安置提经杆（“尼”）", "布线后经线分为上下两层；依次安置三组提经杆，便于分组提起经线。", "完成三组提经"],
  ["安置固定杆（“丝”）", "将尚未织到的线组绕在竹制固定杆上，整理并固定线束。", "确认固定杆"],
  ["“搭”（织造）", "坐姿伸脚保持张力，腰部固定近端；用“用叉”按图案挑线、引纬，再用“打玛”压紧，反复织造。", "查看成带回顾"],
  ["成带回顾 · 数字演示", "回顾前五段文献工序。文献没有单列取带与收边的完整动作，页面不把它们演成已核实步骤。", "完成体验"]
];
if (!db.prepare("SELECT COUNT(*) AS n FROM craft_steps").get().n) {
  const insert = db.prepare("INSERT INTO craft_steps(id,title,description,action,source) VALUES(?,?,?,?,?)");
  stepSeed.forEach((row, i) => insert.run(i + 1, ...row, "杨路色《白龙江流域织锦带工艺的传承与保护研究》，《中国服饰》86–87页"));
}

function json(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders });
  res.end(body);
}
function error(res, status, message) { json(res, status, { error: message }); }
function session(req, res) {
  const cookies = Object.fromEntries((req.headers.cookie || "").split(";").map(x => x.trim().split("=")));
  let sid = cookies[COOKIE_NAME];
  if (!/^[a-f0-9]{64}$/.test(sid || "") || !db.prepare("SELECT 1 FROM sessions WHERE id=?").get(sid)) {
    sid = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(id) VALUES(?)").run(sid);
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE}${req.socket.encrypted ? "; Secure" : ""}`);
  } else db.prepare("UPDATE sessions SET last_seen=CURRENT_TIMESTAMP WHERE id=?").run(sid);
  return sid;
}
function requireAdmin(req, res) {
  const token = req.headers["x-admin-token"] || "";
  if (!ADMIN_TOKEN || typeof token !== "string" || token.length !== ADMIN_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN))) { error(res, 403, "管理员令牌缺失或无效"); return false; }
  return true;
}
function isText(value, max = 200) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function normalizedDesign(body) {
  if (!body || !isText(body.title, 20) || !Array.isArray(body.cells) || body.cells.length !== 9 || !Number.isInteger(body.palette) || body.palette < 0 || body.palette > 7) return null;
  const known = db.prepare("SELECT id FROM motifs WHERE id=?");
  if (!body.cells.every(n => n === null || Number.isInteger(n) && known.get(n + 1))) return null;
  return { title: body.title.trim(), cells: body.cells, palette: body.palette };
}
function designRow(row) { return { id: row.id, title: row.title, cells: JSON.parse(row.cells_json), palette: row.palette, createdAt: row.created_at, updatedAt: row.updated_at }; }
function archiveRow(row) { return { id: row.id, kind: row.kind, title: row.title, image: row.image, summary: row.summary, tags: row.tags, era: row.era, material: row.material, dimensions: row.dimensions, source: row.source, rightsStatus: row.rights_status, verificationStatus: row.verification_status, isDemo: Boolean(row.is_demo), createdAt: row.created_at, updatedAt: row.updated_at }; }
function motifRow(row) { return { id: row.id, index: row.id - 1, title: row.title, kind: row.kind, image: row.image, sourcePath: row.source_path, sourceUrl: row.source_url, description: row.description, meaning: row.meaning, rightsStatus: row.rights_status, verificationStatus: row.verification_status }; }
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!(req.headers["content-type"] || "").startsWith("application/json")) { reject([415, "请使用 application/json"]); return; }
    let size = 0, chunks = [];
    req.on("data", chunk => { size += chunk.length; if (size > MAX_BODY) { reject([413, "请求内容超过 1MB"]); req.destroy(); } else chunks.push(chunk); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject([400, "JSON 格式错误"]); } });
    req.on("error", () => reject([400, "请求读取失败"]));
  });
}
function originAllowed(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
function publicData() {
  return {
    motifs: db.prepare("SELECT * FROM motifs ORDER BY id").all().map(motifRow),
    archives: db.prepare("SELECT * FROM archives ORDER BY id").all().map(archiveRow),
    chapters: db.prepare("SELECT * FROM chapters ORDER BY id").all().map(row => ({ id: row.id, name: row.name, image: row.image, desc: row.description, isDemo: Boolean(row.is_demo) })),
    steps: db.prepare("SELECT * FROM craft_steps ORDER BY id").all().map(row => ({ id: row.id, title: row.title, desc: row.description, action: row.action, source: row.source, verificationStatus: row.verification_status })),
    capabilities: { aiTryOn: false, freeRoam3D: false, arGuide: false, photoUpload: false, localTryOn: true, designStorage: true, weaveProgressStorage: true }
  };
}
function validateArchive(body, old = {}) {
  const result = { kind: body.kind ?? old.kind, title: body.title ?? old.title, image: body.image ?? old.image, summary: body.summary ?? old.summary, tags: body.tags ?? old.tags ?? "", era: body.era ?? old.era ?? "", material: body.material ?? old.material ?? "", dimensions: body.dimensions ?? old.dimensions ?? "", source: body.source ?? old.source ?? "", rightsStatus: body.rightsStatus ?? old.rights_status ?? "pending", verificationStatus: body.verificationStatus ?? old.verification_status ?? "pending", isDemo: body.isDemo ?? Boolean(old.is_demo ?? 1) };
  if (!["纹样", "实物", "工艺", "传承人"].includes(result.kind) || !isText(result.title, 100) || !isText(result.summary, 1000) || !isText(result.image, 200) || !isText(result.source, 500) || !["pending", "cleared"].includes(result.rightsStatus) || !["pending", "verified"].includes(result.verificationStatus) || typeof result.isDemo !== "boolean") return null;
  if (!["tags", "era", "material", "dimensions"].every(key => typeof result[key] === "string" && result[key].length <= 500)) return null;
  if (!(result.image in { "archive-photo": 1, archivePattern: 1, archiveTool: 1, archiveMaker: 1, cultureMain: 1, weave: 1 })) return null;
  return result;
}
function serveStatic(req, res, pathname) {
  const name = pathname === "/" ? "/index.html" : pathname;
  const allowed = name === "/index.html" || name === "/app.js" || name === "/styles.css" || name.startsWith("/assets/");
  if (!allowed || name.includes("\\") || name.includes("\0")) return error(res, 404, "资源不存在");
  let file;
  try { file = path.resolve(ROOT, "." + decodeURIComponent(name)); } catch { return error(res, 400, "路径格式错误"); }
  if (!file.startsWith(ROOT + path.sep)) return error(res, 403, "禁止访问");
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return error(res, 404, "资源不存在");
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) return error(res, 404, "资源不存在");
    res.writeHead(200, { "Content-Type": MIME[ext], "Content-Length": stat.size, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Cache-Control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=86400" });
    fs.createReadStream(file).pipe(res);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) return req.method === "GET" || req.method === "HEAD" ? serveStatic(req, res, pathname) : error(res, 405, "方法不允许");
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return error(res, 405, "方法不允许");
  if (req.method !== "GET" && !originAllowed(req)) return error(res, 403, "跨来源写入被拒绝");
  const sid = session(req, res);
  try {
    if (pathname === "/api/health" && req.method === "GET") return json(res, 200, { ok: true, database: "sqlite", time: new Date().toISOString() });
    if (pathname === "/api/bootstrap" && req.method === "GET") return json(res, 200, publicData());
    if (pathname === "/api/motifs" && req.method === "GET") { const q = (url.searchParams.get("q") || "").slice(0, 100).toLowerCase(), kind = url.searchParams.get("kind") || "全部"; return json(res, 200, publicData().motifs.filter(m => (kind === "全部" || m.kind === kind) && (!q || `${m.title} ${m.description} ${m.meaning}`.toLowerCase().includes(q)))); }
    if (pathname === "/api/archives" && req.method === "GET") { const q = (url.searchParams.get("q") || "").slice(0, 100).toLowerCase(), kind = url.searchParams.get("kind") || "全部"; return json(res, 200, publicData().archives.filter(a => (kind === "全部" || a.kind === kind) && (!q || `${a.title} ${a.summary} ${a.tags}`.toLowerCase().includes(q)))); }
    if (pathname === "/api/chapters" && req.method === "GET") return json(res, 200, publicData().chapters);
    if (pathname === "/api/craft-steps" && req.method === "GET") return json(res, 200, publicData().steps);
    const motifId = pathname.match(/^\/api\/motifs\/(\d+)$/);
    if (motifId && req.method === "GET") { const row = db.prepare("SELECT * FROM motifs WHERE id=?").get(Number(motifId[1])); return row ? json(res, 200, motifRow(row)) : error(res, 404, "纹样不存在"); }
    const archiveId = pathname.match(/^\/api\/archives\/(\d+)$/);
    if (archiveId && req.method === "GET") { const row = db.prepare("SELECT * FROM archives WHERE id=?").get(Number(archiveId[1])); return row ? json(res, 200, archiveRow(row)) : error(res, 404, "档案不存在"); }
    if (pathname === "/api/designs" && req.method === "GET") return json(res, 200, db.prepare("SELECT * FROM designs WHERE session_id=? ORDER BY updated_at DESC,id DESC LIMIT 100").all(sid).map(designRow));
    if (pathname === "/api/designs" && req.method === "POST") { const data = normalizedDesign(await readJson(req)); if (!data) return error(res, 422, "作品标题、九宫格或配色无效"); const id = crypto.randomUUID(); db.prepare("INSERT INTO designs(id,session_id,title,cells_json,palette) VALUES(?,?,?,?,?)").run(id, sid, data.title, JSON.stringify(data.cells), data.palette); return json(res, 201, designRow(db.prepare("SELECT * FROM designs WHERE id=?").get(id))); }
    const designId = pathname.match(/^\/api\/designs\/([a-f0-9-]{36})$/);
    if (designId) { const row = db.prepare("SELECT * FROM designs WHERE id=? AND session_id=?").get(designId[1], sid); if (!row) return error(res, 404, "作品不存在"); if (req.method === "GET") return json(res, 200, designRow(row)); if (req.method === "DELETE") { db.prepare("DELETE FROM designs WHERE id=? AND session_id=?").run(designId[1], sid); return json(res, 200, { deleted: true }); } if (req.method === "PUT") { const data = normalizedDesign(await readJson(req)); if (!data) return error(res, 422, "作品标题、九宫格或配色无效"); db.prepare("UPDATE designs SET title=?,cells_json=?,palette=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?").run(data.title, JSON.stringify(data.cells), data.palette, designId[1], sid); return json(res, 200, designRow(db.prepare("SELECT * FROM designs WHERE id=?").get(designId[1]))); } }
    if (pathname === "/api/weave-progress" && req.method === "GET") { const row = db.prepare("SELECT progress_json FROM weave_progress WHERE session_id=?").get(sid); return json(res, 200, row ? JSON.parse(row.progress_json) : null); }
    if (pathname === "/api/weave-progress" && req.method === "PUT") { const p = await readJson(req); if (!p || !Number.isInteger(p.step) || p.step < 0 || p.step > 5 || !Number.isInteger(p.count) || p.count < 4 || p.count > 32 || !Number.isInteger(p.color) || p.color < 0 || p.color > 7 || !Number.isInteger(p.rounds) || p.rounds < 0 || p.rounds > 10000 || !Array.isArray(p.selected) || p.selected.length > 32 || !p.selected.every(n => Number.isInteger(n) && n >= 0 && n < p.count) || !Number.isInteger(p.heddles) || p.heddles < 0 || p.heddles > 3 || !["tools", "layout", "fixed", "pass", "beat"].every(k => typeof p[k] === "boolean")) return error(res, 422, "体验进度格式无效"); db.prepare("INSERT INTO weave_progress(session_id,progress_json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET progress_json=excluded.progress_json,updated_at=CURRENT_TIMESTAMP").run(sid, JSON.stringify(p)); return json(res, 200, p); }
    if (pathname === "/api/admin/archives" && req.method === "POST") { if (!requireAdmin(req, res)) return; const a = validateArchive(await readJson(req)); if (!a) return error(res, 422, "档案字段无效；请补全标题、摘要、来源及受支持的图片标识"); const result = db.prepare("INSERT INTO archives(kind,title,image,summary,tags,era,material,dimensions,source,rights_status,verification_status,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(a.kind, a.title, a.image, a.summary, a.tags, a.era, a.material, a.dimensions, a.source, a.rightsStatus, a.verificationStatus, Number(a.isDemo)); return json(res, 201, archiveRow(db.prepare("SELECT * FROM archives WHERE id=?").get(result.lastInsertRowid))); }
    const adminArchive = pathname.match(/^\/api\/admin\/archives\/(\d+)$/);
    if (adminArchive && (req.method === "PUT" || req.method === "DELETE")) { if (!requireAdmin(req, res)) return; const row = db.prepare("SELECT * FROM archives WHERE id=?").get(Number(adminArchive[1])); if (!row) return error(res, 404, "档案不存在"); if (req.method === "DELETE") { db.prepare("DELETE FROM archives WHERE id=?").run(row.id); return json(res, 200, { deleted: true }); } const a = validateArchive(await readJson(req), row); if (!a) return error(res, 422, "档案字段无效"); db.prepare("UPDATE archives SET kind=?,title=?,image=?,summary=?,tags=?,era=?,material=?,dimensions=?,source=?,rights_status=?,verification_status=?,is_demo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(a.kind, a.title, a.image, a.summary, a.tags, a.era, a.material, a.dimensions, a.source, a.rightsStatus, a.verificationStatus, Number(a.isDemo), row.id); return json(res, 200, archiveRow(db.prepare("SELECT * FROM archives WHERE id=?").get(row.id))); }
    const adminMotif = pathname.match(/^\/api\/admin\/motifs\/(\d+)$/);
    if (adminMotif && req.method === "PATCH") { if (!requireAdmin(req, res)) return; const id = Number(adminMotif[1]), row = db.prepare("SELECT * FROM motifs WHERE id=?").get(id), body = await readJson(req); if (!row) return error(res, 404, "纹样不存在"); const title = body.title ?? row.title, description = body.description ?? row.description, meaning = body.meaning ?? row.meaning, rights = body.rightsStatus ?? row.rights_status, verification = body.verificationStatus ?? row.verification_status; if (!isText(title, 100) || typeof description !== "string" || description.length > 1000 || typeof meaning !== "string" || meaning.length > 1000 || !["pending", "cleared"].includes(rights) || !["pending", "verified"].includes(verification)) return error(res, 422, "纹样字段无效"); db.prepare("UPDATE motifs SET title=?,description=?,meaning=?,rights_status=?,verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title, description, meaning, rights, verification, id); return json(res, 200, motifRow(db.prepare("SELECT * FROM motifs WHERE id=?").get(id))); }
    return error(res, 404, "接口不存在");
  } catch (e) { if (Array.isArray(e)) return error(res, e[0], e[1]); console.error(e); return error(res, 500, "服务器内部错误"); }
}

const server = http.createServer(handler);
if (require.main === module) server.listen(PORT, HOST, () => console.log(`舟曲锦带平台：http://${HOST}:${PORT}/`));
module.exports = { server, db, DB_FILE };
