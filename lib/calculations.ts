import type { EarningsState, Task } from "./types";

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function asDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function weekKey(value: string | Date, weekStart: number): string {
  const date = typeof value === "string" ? asDate(value) : new Date(value);
  date.setDate(date.getDate() - (date.getDay() - weekStart + 7) % 7);
  return localDate(date);
}

export function weekRange(key: string): string {
  const start = asDate(key);
  const left = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start);
  const right = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(addDays(start, 6));
  return `${left} – ${right}`;
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(asDate(value));
}

export function money(value: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function taskAmounts(task: Pick<Task, "hours" | "hourlyRate" | "bonusAmount" | "othersAmount">) {
  const hourly = task.hours * task.hourlyRate;
  return { hourly, bonus: task.bonusAmount, others: task.othersAmount, total: hourly + task.bonusAmount + task.othersAmount };
}

export function loggedHours(task: Task, state: EarningsState): number {
  return state.projects.find(project => project.id === task.projectId)?.tracksWorkedHours ? task.hoursWorked ?? 0 : task.hours;
}

export function weekTasks(state: EarningsState, key: string): Task[] {
  return state.tasks.filter(task => weekKey(task.date, state.settings.weekStart) === key).sort((a, b) => b.date.localeCompare(a.date));
}

export function weekKeys(state: EarningsState): string[] {
  return [...new Set([
    ...state.tasks.map(task => weekKey(task.date, state.settings.weekStart)),
    ...Object.keys(state.weeklyBonuses), ...Object.keys(state.weeklyActualPaid), ...Object.keys(state.taxFreeWeeks),
  ])].sort((a, b) => b.localeCompare(a));
}

export function weekTotals(state: EarningsState, key: string) {
  const byProject = new Map<string, { name: string; hourly: number; bonus: number; others: number; total: number }>();
  let hoursBilled = 0, hoursWorked = 0, taskTotal = 0;
  for (const task of weekTasks(state, key)) {
    const name = state.projects.find(project => project.id === task.projectId)?.name ?? "Unassigned project";
    const amount = taskAmounts(task);
    hoursBilled += task.hours;
    hoursWorked += loggedHours(task, state);
    taskTotal += amount.total;
    const row = byProject.get(task.projectId) ?? { name, hourly: 0, bonus: 0, others: 0, total: 0 };
    row.hourly += amount.hourly; row.bonus += amount.bonus; row.others += amount.others; row.total += amount.total;
    byProject.set(task.projectId, row);
  }
  const bonus = state.weeklyBonuses[key] ?? 0;
  return { byProject: [...byProject.values()], hoursBilled, hoursWorked, taskTotal, bonus, total: taskTotal + bonus };
}

export function monthKey(date = new Date()): string {
  return localDate(date).slice(0, 7);
}

export function monthLabel(key: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(asDate(`${key}-01`));
}

export function payrollMonthKey(week: string): string {
  const periodEnd = addDays(asDate(week), 6);
  const daysUntilFriday = (5 - periodEnd.getDay() + 7) % 7 || 7;
  return monthKey(addDays(periodEnd, daysUntilFriday));
}

export function monthTaxSummary(state: EarningsState, key: string) {
  let gross = 0, taxableGross = 0;
  for (const [week, amount] of Object.entries(state.weeklyActualPaid)) {
    if (payrollMonthKey(week) !== key) continue;
    gross += amount;
    if (!state.taxFreeWeeks[week]) taxableGross += amount;
  }
  const taxes = state.taxes.map(tax => {
    const base = tax.monthlyRoof == null ? taxableGross : Math.min(taxableGross, tax.monthlyRoof);
    return { ...tax, base, amount: Math.round(base * tax.percentage) / 100 };
  });
  const taxTotal = taxes.reduce((sum, tax) => sum + tax.amount, 0);
  return { gross, taxableGross, taxes, taxTotal, net: gross - taxTotal };
}

export function monthsFromStart(state: EarningsState, now = new Date()): string[] {
  const current = monthKey(now);
  const first = weekKeys(state).sort()[0]?.slice(0, 7) ?? current;
  const cursor = asDate(`${first}-01`), end = asDate(`${current}-01`);
  if (cursor > end) return [current];
  const months: string[] = [];
  while (cursor <= end) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function lifetimeTotals(state: EarningsState) {
  const tasks = state.tasks.reduce((sum, task) => sum + taskAmounts(task).total, 0);
  const bonuses = Object.values(state.weeklyBonuses).reduce((sum, amount) => sum + amount, 0);
  return {
    tasks, bonuses, projected: tasks + bonuses,
    earned: Object.values(state.weeklyActualPaid).reduce((sum, amount) => sum + amount, 0),
    hours: state.tasks.reduce((sum, task) => sum + loggedHours(task, state), 0),
  };
}
