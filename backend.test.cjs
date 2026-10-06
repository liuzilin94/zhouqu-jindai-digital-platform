"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jindai-backend-test-"));
process.env.JINDAI_DATA_DIR = testDir;
process.env.JINDAI_ADMIN_TOKEN = "test-token-only";
const { server, db } = require("./server.cjs");

test("后端 API：资料、访客隔离、保存、校验与管理员修改", async t => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    if (path.resolve(testDir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(testDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookieA = "";
  async function request(route, options = {}, owner = "a") {
    const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
    if (owner === "a" && cookieA) headers.Cookie = cookieA;
    const res = await fetch(base + route, { ...options, headers });
    if (owner === "a" && res.headers.get("set-cookie")) cookieA = res.headers.get("set-cookie").split(";")[0];
    return [res.status, await res.json()];
  }
  let [status, data] = await request("/api/health");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  [status, data] = await request("/api/bootstrap");
  assert.equal(data.motifs.length, 35);
  assert.equal(data.archives.length, 6);
  assert.equal(data.chapters.length, 6);
  assert.equal(data.steps.length, 6);
  assert.equal(data.capabilities.aiTryOn, false);

  const design = { title: "测试锦带", cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], palette: 2 };
  [status, data] = await request("/api/designs", { method: "POST", body: JSON.stringify(design) });
  assert.equal(status, 201);
  const id = data.id;
  [status, data] = await request("/api/designs");
  assert.equal(data.length, 1);
  [status] = await request(`/api/designs/${id}`, {}, "b");
  assert.equal(status, 404);
  [status] = await request("/api/designs", { method: "POST", body: JSON.stringify({ ...design, cells: [99, 1, 2, 3, 4, 5, 6, 7, 8] }) });
  assert.equal(status, 422);
  [status, data] = await request(`/api/designs/${id}`, { method: "PUT", body: JSON.stringify({ ...design, title: "更新作品" }) });
  assert.equal(data.title, "更新作品");
  [status, data] = await request(`/api/designs/${id}`, { method: "DELETE" }, "b");
  assert.equal(status, 404);
  [status, data] = await request(`/api/designs/${id}`, { method: "DELETE" });
  assert.equal(status, 200);
  assert.equal(data.deleted, true);
  [status, data] = await request("/api/designs");
  assert.equal(data.length, 0);

  const progress = { step: 4, count: 12, color: 1, rounds: 2, selected: [2, 3], heddles: 3, tools: true, layout: true, fixed: true, pass: false, beat: true };
  [status] = await request("/api/weave-progress", { method: "PUT", body: JSON.stringify(progress) });
  assert.equal(status, 200);
  [status, data] = await request("/api/weave-progress");
  assert.deepEqual(data, progress);

  [status] = await request("/api/admin/archives", { method: "POST", body: JSON.stringify({ kind: "纹样", title: "测试条目", image: "archivePattern", summary: "测试摘要", source: "测试来源" }) });
  assert.equal(status, 403);
  [status, data] = await request("/api/admin/archives", { method: "POST", headers: { "X-Admin-Token": "test-token-only" }, body: JSON.stringify({ kind: "纹样", title: "测试条目", image: "archivePattern", summary: "测试摘要", source: "测试来源" }) });
  assert.equal(status, 201);
  assert.equal(data.isDemo, true);
  [status, data] = await request("/api/archives?q=测试条目");
  assert.equal(data.length, 1);

  const html = await fetch(base + "/");
  assert.equal(html.status, 200);
  assert.match(await html.text(), /舟曲锦带/);
  const hidden = await fetch(base + "/server.cjs");
  assert.equal(hidden.status, 404);
});
