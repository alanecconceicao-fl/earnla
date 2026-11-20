import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./migrations";
import { parseState } from "./state";
import type { EarningsState } from "./types";

const globalDb = globalThis as typeof globalThis & { earnlaDb?: DatabaseSync };

export function getDatabase(): DatabaseSync {
  return globalDb.earnlaDb ??= openDatabase();
}

export function readState(db: DatabaseSync): EarningsState {
  const settingRows = db.prepare("SELECT key, value FROM settings").all();
  const settings = Object.fromEntries(settingRows.map(row => [String(row.key), JSON.parse(String(row.value))]));
  const projects = db.prepare("SELECT id, name, hourly_rate AS hourlyRate, tracks_worked_hours AS tracksWorkedHours FROM projects ORDER BY rowid").all();
  const tasks = db.prepare("SELECT id, project_id AS projectId, name, hours, hourly_rate AS hourlyRate, hours_worked AS hoursWorked, task_date AS date, bonus_amount AS bonusAmount, others_amount AS othersAmount FROM tasks ORDER BY task_date, rowid").all();
  const taxes = db.prepare("SELECT id, name, percentage, monthly_roof AS monthlyRoof FROM taxes ORDER BY rowid").all();
  const weeklyAmounts = (table: "weekly_bonuses" | "weekly_actual_paid") => Object.fromEntries(
    db.prepare(`SELECT week_start, amount FROM ${table}`).all().map(row => [String(row.week_start), Number(row.amount)]),
  );
  return parseState({
    settings,
    projects: projects.map(project => ({ ...project, tracksWorkedHours: Boolean(project.tracksWorkedHours) })),
    tasks, taxes, weeklyBonuses: weeklyAmounts("weekly_bonuses"), weeklyActualPaid: weeklyAmounts("weekly_actual_paid"),
    taxFreeWeeks: Object.fromEntries(db.prepare("SELECT week_start FROM weekly_tax_free").all().map(row => [String(row.week_start), true])),
  });
}

export function saveState(db: DatabaseSync, value: unknown): EarningsState {
  const rateQuery = db.prepare("SELECT hourly_rate FROM tasks WHERE id = ? AND project_id = ?");
  const state = parseState(value, (id, projectId) => {
    const row = rateQuery.get(id, projectId);
    return row ? Number(row.hourly_rate) : undefined;
  });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM tasks; DELETE FROM projects; DELETE FROM settings; DELETE FROM weekly_bonuses; DELETE FROM weekly_actual_paid; DELETE FROM weekly_tax_free; DELETE FROM taxes;");
    const setting = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?)");
    Object.entries(state.settings).forEach(([key, value]) => setting.run(key, JSON.stringify(value)));
    const project = db.prepare("INSERT INTO projects(id, name, hourly_rate, tracks_worked_hours) VALUES (?, ?, ?, ?)");
    state.projects.forEach(row => project.run(row.id, row.name, row.hourlyRate, Number(row.tracksWorkedHours)));
    const task = db.prepare("INSERT INTO tasks(id, project_id, name, hours, hourly_rate, hours_worked, task_date, bonus_amount, others_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    state.tasks.forEach(row => task.run(row.id, row.projectId, row.name, row.hours, row.hourlyRate, row.hoursWorked, row.date, row.bonusAmount, row.othersAmount));
    const bonus = db.prepare("INSERT INTO weekly_bonuses(week_start, amount) VALUES (?, ?)");
    Object.entries(state.weeklyBonuses).forEach(([week, amount]) => bonus.run(week, amount));
    const paid = db.prepare("INSERT INTO weekly_actual_paid(week_start, amount) VALUES (?, ?)");
    Object.entries(state.weeklyActualPaid).forEach(([week, amount]) => paid.run(week, amount));
    const tax = db.prepare("INSERT INTO taxes(id, name, percentage, monthly_roof) VALUES (?, ?, ?, ?)");
    state.taxes.forEach(row => tax.run(row.id, row.name, row.percentage, row.monthlyRoof));
    const taxFree = db.prepare("INSERT INTO weekly_tax_free(week_start) VALUES (?)");
    Object.entries(state.taxFreeWeeks).forEach(([week, enabled]) => { if (enabled) taxFree.run(week); });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readState(db);
}
