import { asDate, localDate } from "./calculations";
import type { EarningsState, Project, Tax, Task } from "./types";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`Invalid ${label}.`);
  return value.trim();
}

function amount(value: unknown, label: string, fallback?: number): number {
  if (value == null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Invalid ${label}.`);
  }
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`Invalid ${label}.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Invalid ${label}.`);
  return result;
}

function dateKey(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || localDate(asDate(value)) !== value) throw new Error("Invalid date.");
  return value;
}

function uniqueIds(items: { id: string }[], label: string) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`Duplicate ${label} IDs.`);
}

function amountMap(value: unknown): Record<string, number> {
  if (value == null) return {};
  return Object.fromEntries(Object.entries(object(value, "weekly amounts")).map(([key, value]) => [dateKey(key), amount(value, "weekly amount")]));
}

export function parseState(value: unknown, savedTaskRate?: (id: string, projectId: string) => number | undefined): EarningsState {
  const data = object(value, "earnings data");
  if (!Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error("This JSON does not contain Earnla projects and tasks.");
  const settings = data.settings == null ? {} : object(data.settings, "settings");
  const weekStart = Number(settings.weekStart ?? 1);
  if (![0, 1, 6].includes(weekStart)) throw new Error("Invalid week start.");
  const projects: Project[] = data.projects.map(value => {
    const project = object(value, "project");
    return {
      id: text(project.id ?? crypto.randomUUID(), "project ID"), name: text(project.name, "project name"),
      hourlyRate: amount(project.hourlyRate, "project rate", 0), tracksWorkedHours: project.tracksWorkedHours === true,
    };
  });
  uniqueIds(projects, "project");
  const projectRates = new Map(projects.map(project => [project.id, project.hourlyRate]));
  const tasks: Task[] = data.tasks.map(value => {
    const task = object(value, "task");
    const id = text(task.id ?? crypto.randomUUID(), "task ID");
    const projectId = text(task.projectId, "task project");
    if (!projectRates.has(projectId)) throw new Error("A task refers to a missing project.");
    return {
      id, projectId, name: text(task.name, "task name"), date: dateKey(task.date),
      hours: Math.round(amount(task.hours, "billed hours") * 100) / 100,
      hourlyRate: amount(task.hourlyRate, "task rate", savedTaskRate?.(id, projectId) ?? projectRates.get(projectId)),
      hoursWorked: task.hoursWorked == null || task.hoursWorked === "" ? null : Math.round(amount(task.hoursWorked, "worked hours") * 100) / 100,
      bonusAmount: amount(task.bonusAmount, "task bonus", 0), othersAmount: amount(task.othersAmount, "task others", 0),
    };
  });
  uniqueIds(tasks, "task");
  if (data.taxes != null && !Array.isArray(data.taxes)) throw new Error("Invalid taxes.");
  const taxes: Tax[] = ((data.taxes ?? []) as unknown[]).map(value => {
    const tax = object(value, "tax");
    const percentage = amount(tax.percentage, "tax percentage");
    if (percentage > 100) throw new Error("Tax percentage must be between 0 and 100.");
    return {
      id: text(tax.id ?? crypto.randomUUID(), "tax ID"), name: text(tax.name, "tax name"), percentage,
      monthlyRoof: tax.monthlyRoof == null || tax.monthlyRoof === "" ? null : amount(tax.monthlyRoof, "tax roof"),
    };
  });
  uniqueIds(taxes, "tax");
  const taxFreeWeeks = data.taxFreeWeeks == null ? {} : Object.fromEntries(
    Object.entries(object(data.taxFreeWeeks, "tax-free weeks")).map(([key, value]) => {
      if (typeof value !== "boolean") throw new Error("Invalid tax-free week.");
      return [dateKey(key), value];
    }),
  );
  return {
    settings: { currency: "USD", weekStart, taxesInitialized: true }, projects, tasks, taxes,
    weeklyBonuses: amountMap(data.weeklyBonuses), weeklyActualPaid: amountMap(data.weeklyActualPaid), taxFreeWeeks,
  };
}

// Legacy exports are converted only when a user chooses an import file.
export function parseBackup(value: unknown): EarningsState {
  const data = object(value, "backup");
  if (Array.isArray(data.projects)) return parseState(data);
  const settings = object(data.settings, "backup settings");
  if (!Array.isArray(settings.projects) || !Array.isArray(data.tasks)) throw new Error("This JSON does not contain Earnla data.");
  const oldProjects = settings.projects.map(value => object(value, "project"));
  const projects = oldProjects.map(project => ({
    id: project.id ?? crypto.randomUUID(), name: project.name, hourlyRate: project.hourlyRate,
    tracksWorkedHours: project.tracksWorkedHours === true,
  }));
  const tasks = data.tasks.map(value => {
    const task = object(value, "task");
    const index = oldProjects.findIndex(project => String(project.name).toLowerCase() === String(task.project).toLowerCase());
    const project = oldProjects[index];
    const sourceDate = task.submittedAt ?? task.date;
    const date = typeof sourceDate === "string" ? sourceDate.slice(0, 10) : sourceDate;
    return {
      id: task.id ?? crypto.randomUUID(), projectId: projects[index]?.id, name: task.name, hours: task.hours,
      hourlyRate: task.hourlyRate, hoursWorked: task.hoursWorked, date,
      bonusAmount: task.bonusAmount ?? task.bonus ?? 0,
      othersAmount: task.othersAmount ?? task.others ?? (task.status === "rejected" ? project?.rejectedFlat : project?.acceptedFlat) ?? 0,
    };
  });
  return parseState({ ...data, settings, projects, tasks });
}
