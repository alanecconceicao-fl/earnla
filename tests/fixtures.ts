import { emptyState, type EarningsState } from "../lib/types";

// Synthetic records only. Never copy real projects or payments into test fixtures.
export function fixture(): EarningsState {
  return {
    ...emptyState(),
    projects: [{ id: "project-1", name: "Sample project", hourlyRate: 80, tracksWorkedHours: true }],
    tasks: [{ id: "task-1", projectId: "project-1", name: "Sample task", hours: 1.25, hourlyRate: 80, hoursWorked: 2.75, date: "2025-01-27", bonusAmount: 7, othersAmount: 3 }],
    weeklyBonuses: { "2025-01-27": 15 },
    weeklyActualPaid: { "2025-01-27": 200 },
    taxes: [{ id: "tax-1", name: "Sample tax", percentage: 10, monthlyRoof: null }],
  };
}
