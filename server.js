// 容器二维码：二维码里只放 /q/<短码>，产品信息存在后端。
// 扫一次码写进去，再扫读出来；容器码永不变，数据可反复更新并保留历史。
// 表单字段定义存在数据库里，管理端 /fields.html 可视化配置，保存后即时生效。
import express from 'express';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { defaultFields, validateFieldDefs, validateRecord } from './config/fields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(path.join(__dirname, 'db.sqlite'));




app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// 本地托管二维码生成库（qrcode-generator），前端无需外网
app.use(
  '/vendor/qrcode',
  express.static(path.join(__dirname, 'node_modules', 'qrcode-generator', 'dist'))
);

// 建表：
//   containers 贴在容器上的固定码；records 往里写的每一笔数据；field_defs 表单字段定义
db.exec(`
  CREATE TABLE IF NOT EXISTS containers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_records_code ON records (code, id DESC);

  CREATE TABLE IF NOT EXISTS field_defs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    "key"         TEXT UNIQUE NOT NULL,
    label         TEXT NOT NULL,
    type          TEXT NOT NULL,
    required      INTEGER NOT NULL DEFAULT 0,
    options       TEXT,
    default_value TEXT,
    max_length    INTEGER,
    placeholder   TEXT,
    sort_order    INTEGER NOT NULL
  );
`);

const stmt = {
  insertContainer: db.prepare('INSERT INTO containers (code) VALUES (?)'),
  container: db.prepare('SELECT code, created_at, updated_at FROM containers WHERE code = ?'),
  listContainers: db.prepare(
    'SELECT code, created_at, updated_at FROM containers ORDER BY id DESC LIMIT ?'
  ),
  touchContainer: db.prepare("UPDATE containers SET updated_at = datetime('now','localtime') WHERE code = ?"),
  insertRecord: db.prepare('INSERT INTO records (code, data) VALUES (?, ?)'),
  latestRecord: db.prepare('SELECT id, data, created_at FROM records WHERE code = ? ORDER BY id DESC LIMIT 1'),
  recentRecords: db.prepare('SELECT id, data, created_at FROM records WHERE code = ? ORDER BY id DESC LIMIT ?'),
  countRecords: db.prepare('SELECT COUNT(*) AS n FROM records WHERE code = ?'),

  fieldAll: db.prepare(
    'SELECT "key", label, type, required, options, default_value, max_length, placeholder FROM field_defs ORDER BY sort_order, id'
  ),
  fieldCount: db.prepare('SELECT COUNT(*) AS n FROM field_defs'),
  fieldClear: db.prepare('DELETE FROM field_defs'),
  fieldInsert: db.prepare(
    'INSERT INTO field_defs ("key", label, type, required, options, default_value, max_length, placeholder, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
};

// 整份替换字段定义（配置页保存时用），放在事务里，避免中途失败留下半份定义
const replaceFieldDefs = db.transaction((list) => {
  stmt.fieldClear.run();
  list.forEach((f, i) => {
    stmt.fieldInsert.run(
      f.key,
      f.label,
      f.type,
      f.required ? 1 : 0,
      JSON.stringify(f.options ?? []),
      f.default ?? '',
      f.maxLength ?? null,
      f.placeholder ?? '',
      i
    );
  });
});

// 数据库里还没有字段定义时，用 config/fields.js 的默认值初始化
if (stmt.fieldCount.get().n === 0) {
  replaceFieldDefs(defaultFields);
  console.log('📋 已用 config/fields.js 的默认字段初始化表单定义');
}

function parseOptions(text) {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// 当前生效的字段定义
function getFields() {
  return stmt.fieldAll.all().map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type,
    required: !!r.required,
    options: r.options ? parseOptions(r.options) : [],
    default: r.default_value ?? '',
    maxLength: r.max_length ?? null,
    placeholder: r.placeholder ?? '',
  }));
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// fieldKeys 传入时，额外算出这条记录里「已不在当前字段定义中」的键，供页面标注显示
function toRecord(row, fieldKeys) {
  const data = safeParse(row.data);
  const extra = [];

  if (fieldKeys) {
    for (const [key, value] of Object.entries(data)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (!fieldKeys.has(key) && text.trim()) extra.push({ key, value: text });
    }
  }

  return { id: row.id, created_at: row.created_at, data, extra };
}

function containerState(code) {
  const c = stmt.container.get(code);
  if (!c) return null;

  const fieldKeys = new Set(getFields().map((f) => f.key));
  const recent = stmt.recentRecords.all(code, RECENT_LIMIT).map((row) => toRecord(row, fieldKeys));

  return {
    code: c.code,
    created_at: c.created_at,
    updated_at: c.updated_at,
    record_count: stmt.countRecords.get(code).n,
    latest: recent[0] ?? null,
    records: recent,
  };
}

function summarize(code) {
  const c = stmt.container.get(code);
  if (!c) return null;
  const latest = stmt.latestRecord.get(code);
  return {
    code: c.code,
    created_at: c.created_at,
    updated_at: c.updated_at,
    record_count: stmt.countRecords.get(code).n,
    latest: latest ? toRecord(latest, null) : null,
  };
}

// 当前字段定义：扫码页据此渲染表单，配置页据此编辑
app.get('/api/fields', (req, res) => {
  res.json({ fields: getFields() });
});

// config/fields.js 里的默认定义，供配置页「恢复默认」
app.get('/api/fields/defaults', (req, res) => {
  res.json({ fields: defaultFields });
});

// 保存字段定义：整份替换，保存后即时生效（不需要重启）
app.put('/api/fields', (req, res) => {
  const { fields: incoming } = req.body ?? {};
  const { fields: clean, errors } = validateFieldDefs(incoming);
  if (errors.length) {
    return res.status(400).json({ error: errors.join('；'), errors });
  }
  replaceFieldDefs(clean);
  res.json({ fields: getFields() });
});

// 可用访问地址：手机扫码要走局域网 IP，所以候选地址里局域网排在最前
app.get('/api/server', (req, res) => {
  res.json({ port: PORT, bases: candidateBases(req) });
});

// 新建容器：系统生成短码，一旦生成永不变，二维码可以随时补打
app.post('/api/containers', (req, res) => {
  const code = nanoid(8); // 8 位短码，生成后永不变
  stmt.insertContainer.run(code);
  res.status(201).json(summarize(code));
});

// 容器列表：最近创建的在前
app.get('/api/containers', (req, res) => {
  const raw = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 20, 1), 100);
  const containers = stmt.listContainers.all(limit).map((c) => summarize(c.code));
  res.json({ containers });
});

// 读一个容器：最新一条 + 历史记录
app.get('/api/containers/:code', (req, res) => {
  const state = containerState(req.params.code);
  if (!state) return res.status(404).json({ error: '该二维码未注册为容器' });
  res.json(state);
});

// 往容器里写一笔：追加记录，页面展示最新，历史全部保留
app.post('/api/containers/:code/records', (req, res) => {
  const code = req.params.code;
  if (!stmt.container.get(code)) {
    return res.status(404).json({ error: '该二维码未注册为容器' });
  }

  const { data, errors } = validateRecord(req.body, getFields());
  if (errors.length) {
    return res.status(400).json({ error: errors.join('；'), errors });
  }

  stmt.insertRecord.run(code, JSON.stringify(data));
  stmt.touchContainer.run(code);
  res.status(201).json(containerState(code));
});

// 扫码后打开的页面
app.get('/q/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// 统一返回 JSON 错误，避免给前端返回 HTML
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法 JSON' });
  }
  console.error(err);
  res.status(500).json({ error: '服务端错误' });
});

app.listen(PORT, () => {
  console.log(`✅ 管理端（新建容器 / 打印标签）：http://localhost:${PORT}`);
  console.log(`🛠  字段配置：http://localhost:${PORT}/fields.html`);
  for (const ip of lanIPv4()) {
    console.log(`📱 手机扫码（同一局域网）：http://${ip}:${PORT}/`);
  }
});

// 生成标签时可用的访问地址：非 localhost 的访问地址优先，其次是本机局域网 IP
function candidateBases(req) {
  const scheme = req.protocol;
  const host = req.get('host');
  const list = [];
  if (!isLocalHost(host)) list.push(`${scheme}://${host}`);
  for (const ip of lanIPv4()) list.push(`${scheme}://${ip}:${PORT}`);
  list.push(`${scheme}://localhost:${PORT}`);
  return [...new Set(list)];
}

function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host || '');
}

// 列出局域网 IPv4，方便手机扫码访问
function lanIPv4() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}
