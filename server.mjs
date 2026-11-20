import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dbPath = resolve(root, 'earnings.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, hourly_rate REAL NOT NULL DEFAULT 0, tracks_worked_hours INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hours REAL NOT NULL DEFAULT 0,
    hourly_rate REAL NOT NULL CHECK (hourly_rate >= 0),
    task_date TEXT NOT NULL,
    hours_worked REAL,
    bonus_amount REAL NOT NULL DEFAULT 0,
    others_amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT
  );
  CREATE TABLE IF NOT EXISTS weekly_bonuses (week_start TEXT PRIMARY KEY, amount REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS weekly_actual_paid (week_start TEXT PRIMARY KEY, amount REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS weekly_tax_free (week_start TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS taxes (id TEXT PRIMARY KEY, name TEXT NOT NULL, percentage REAL NOT NULL, monthly_roof REAL);
`);
const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
if (!projectColumns.has('tracks_worked_hours')) {
  db.exec('ALTER TABLE projects ADD COLUMN tracks_worked_hours INTEGER NOT NULL DEFAULT 0');
  db.prepare("UPDATE projects SET tracks_worked_hours = 1 WHERE lower(trim(name)) = 'code behaviors'").run();
}
const taskColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name));
if (!taskColumns.has('hours_worked')) db.exec('ALTER TABLE tasks ADD COLUMN hours_worked REAL');
if (!taskColumns.has('hourly_rate')) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      ALTER TABLE tasks ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0);
      UPDATE tasks
      SET hourly_rate = (SELECT hourly_rate FROM projects WHERE projects.id = tasks.project_id);
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readState() {
  const settingRows = db.prepare('SELECT key, value FROM settings').all();
  const projectRows = db.prepare('SELECT id, name, hourly_rate AS hourlyRate, tracks_worked_hours AS tracksWorkedHours FROM projects ORDER BY rowid').all();
  const taskRows = db.prepare('SELECT id, project_id AS projectId, name, hours, hourly_rate AS hourlyRate, hours_worked AS hoursWorked, task_date AS date, bonus_amount AS bonusAmount, others_amount AS othersAmount FROM tasks ORDER BY task_date, rowid').all();
  const bonusRows = db.prepare('SELECT week_start, amount FROM weekly_bonuses').all();
  const paidRows = db.prepare('SELECT week_start, amount FROM weekly_actual_paid').all();
  const taxRows = db.prepare('SELECT id, name, percentage, monthly_roof AS monthlyRoof FROM taxes ORDER BY rowid').all();
  const taxFreeRows = db.prepare('SELECT week_start FROM weekly_tax_free').all();
  if (!settingRows.length && !projectRows.length && !taskRows.length && !bonusRows.length && !paidRows.length && !taxRows.length && !taxFreeRows.length) return null;
  const settings = Object.fromEntries(settingRows.map(row => [row.key, JSON.parse(row.value)]));
  return {
    settings: { currency: 'USD', weekStart: Number(settings.weekStart ?? 1), taxesInitialized: Boolean(settings.taxesInitialized) },
    projects: projectRows.map(row => ({ ...row, hourlyRate: Number(row.hourlyRate), tracksWorkedHours: Boolean(row.tracksWorkedHours) })),
    tasks: taskRows.map(row => ({ ...row, hours: Number(row.hours), hoursWorked: row.hoursWorked == null ? null : Number(row.hoursWorked), bonusAmount: Number(row.bonusAmount), othersAmount: Number(row.othersAmount) })),
    weeklyBonuses: Object.fromEntries(bonusRows.map(row => [row.week_start, Number(row.amount)])),
    weeklyActualPaid: Object.fromEntries(paidRows.map(row => [row.week_start, Number(row.amount)])),
    taxes: taxRows.map(row => ({ ...row, percentage: Number(row.percentage), monthlyRoof: row.monthlyRoof == null ? null : Number(row.monthlyRoof) })),
    taxFreeWeeks: Object.fromEntries(taxFreeRows.map(row => [row.week_start, true]))
  };
}

function saveState(data) {
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error('Invalid earnings data');
  const settings = data.settings || {};
  const projects = data.projects.map(project => ({ id: String(project.id || ''), name: String(project.name || '').trim(), hourlyRate: Number(project.hourlyRate) || 0, tracksWorkedHours: Boolean(project.tracksWorkedHours) }));
  if (projects.some(project => !project.id || !project.name || !Number.isFinite(project.hourlyRate) || project.hourlyRate < 0)) throw new Error('Invalid project data');
  const projectRates = new Map(projects.map(project => [project.id, project.hourlyRate]));
  const tasks = data.tasks.map(task => ({
    id: String(task.id || ''), projectId: String(task.projectId || ''), name: String(task.name || '').trim(),
    hours: Number(task.hours), hoursWorked: task.hoursWorked == null || task.hoursWorked === '' ? null : Number(task.hoursWorked), date: String(task.date || '').slice(0, 10),
    hourlyRate: task.hourlyRate == null || task.hourlyRate === '' ? null : Number(task.hourlyRate),
    bonusAmount: Number(task.bonusAmount) || 0, othersAmount: Number(task.othersAmount) || 0
  }));
  if (tasks.some(task => !task.id || !task.projectId || !projectRates.has(task.projectId) || !task.name || !/^\d{4}-\d{2}-\d{2}$/.test(task.date) || !Number.isFinite(task.hours) || task.hours < 0 || (task.hoursWorked != null && (!Number.isFinite(task.hoursWorked) || task.hoursWorked < 0)) || (task.hourlyRate != null && (!Number.isFinite(task.hourlyRate) || task.hourlyRate < 0)) || task.bonusAmount < 0 || task.othersAmount < 0)) throw new Error('Invalid task data');
  const weeklyBonuses = data.weeklyBonuses && typeof data.weeklyBonuses === 'object' ? data.weeklyBonuses : {};
  const weeklyActualPaid = data.weeklyActualPaid && typeof data.weeklyActualPaid === 'object' ? data.weeklyActualPaid : {};
  const taxes = Array.isArray(data.taxes) ? data.taxes.map(tax => ({
    id: String(tax.id || ''), name: String(tax.name || '').trim(), percentage: Number(tax.percentage),
    monthlyRoof: tax.monthlyRoof == null || tax.monthlyRoof === '' ? null : Number(tax.monthlyRoof)
  })) : [];
  if (taxes.some(tax => !tax.id || !tax.name || !Number.isFinite(tax.percentage) || tax.percentage < 0 || tax.percentage > 100 || (tax.monthlyRoof != null && (!Number.isFinite(tax.monthlyRoof) || tax.monthlyRoof < 0)))) throw new Error('Invalid tax rule');
  const taxFreeWeeks = data.taxFreeWeeks && typeof data.taxFreeWeeks === 'object' ? data.taxFreeWeeks : {};

  db.exec('BEGIN IMMEDIATE');
  try {
    // Older clients can still save a task without sending its rate.
    const existingRate = db.prepare('SELECT hourly_rate FROM tasks WHERE id = ? AND project_id = ?');
    for (const task of tasks) {
      if (task.hourlyRate == null) {
        task.hourlyRate = existingRate.get(task.id, task.projectId)?.hourly_rate ?? projectRates.get(task.projectId);
      }
    }
    db.exec('DELETE FROM tasks; DELETE FROM projects; DELETE FROM settings; DELETE FROM weekly_bonuses; DELETE FROM weekly_actual_paid; DELETE FROM weekly_tax_free; DELETE FROM taxes;');
    const insertSetting = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?)');
    insertSetting.run('currency', JSON.stringify('USD'));
    insertSetting.run('weekStart', JSON.stringify(Number(settings.weekStart ?? 1)));
    insertSetting.run('taxesInitialized', JSON.stringify(Boolean(settings.taxesInitialized)));
    const insertProject = db.prepare('INSERT INTO projects(id, name, hourly_rate, tracks_worked_hours) VALUES(?, ?, ?, ?)');
    projects.forEach(project => insertProject.run(project.id, project.name, project.hourlyRate, project.tracksWorkedHours ? 1 : 0));
    const insertTask = db.prepare('INSERT INTO tasks(id, project_id, name, hours, hourly_rate, hours_worked, task_date, bonus_amount, others_amount) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
    tasks.forEach(task => insertTask.run(task.id, task.projectId, task.name, task.hours, task.hourlyRate, task.hoursWorked, task.date, task.bonusAmount, task.othersAmount));
    const insertBonus = db.prepare('INSERT INTO weekly_bonuses(week_start, amount) VALUES(?, ?)');
    Object.entries(weeklyBonuses).forEach(([week, amount]) => {
      const value = Number(amount);
      if (/^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(value) && value > 0) insertBonus.run(week, value);
    });
    const insertPaid = db.prepare('INSERT INTO weekly_actual_paid(week_start, amount) VALUES(?, ?)');
    Object.entries(weeklyActualPaid).forEach(([week, amount]) => {
      const value = Number(amount);
      if (/^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(value) && value > 0) insertPaid.run(week, value);
    });
    const insertTax = db.prepare('INSERT INTO taxes(id, name, percentage, monthly_roof) VALUES(?, ?, ?, ?)');
    taxes.forEach(tax => insertTax.run(tax.id, tax.name, tax.percentage, tax.monthlyRoof));
    const insertTaxFree = db.prepare('INSERT INTO weekly_tax_free(week_start) VALUES(?)');
    Object.entries(taxFreeWeeks).forEach(([week, isTaxFree]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(week) && isTaxFree === true) insertTaxFree.run(week);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readState();
}

async function readRequestBody(req, limit = 5_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/state' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }).end(JSON.stringify({ state: readState() }));
      return;
    }
    if (url.pathname === '/api/state' && req.method === 'PUT') {
      let imported;
      try { imported = JSON.parse(await readRequestBody(req)); }
      catch (error) {
        res.writeHead(400, { 'Content-Type':'application/json; charset=utf-8' }).end(JSON.stringify({ error: error.message }));
        return;
      }
      try {
        const state = saveState(imported);
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }).end(JSON.stringify({ state }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type':'application/json; charset=utf-8' }).end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type':'text/plain; charset=utf-8', 'Allow':'GET, HEAD, PUT' }).end('Method not allowed');
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const requested = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (/\.sqlite(?:-(?:shm|wal))?$/i.test(requested)) {
      res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    if (requested !== root && !requested.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(requested);
    res.writeHead(200, { 'Content-Type': mime[extname(requested)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    if (req.method === 'HEAD') res.end(); else res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }).end('Not found');
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Earnla running at http://127.0.0.1:${port} (SQLite: ${dbPath})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => { db.close(); process.exit(0); }); });
