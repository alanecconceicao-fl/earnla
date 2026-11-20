import assert from "node:assert/strict";
import test from "node:test";
import { lifetimeTotals, loggedHours, monthTaxSummary, monthsFromStart, payrollMonthKey, taskAmounts, weekKey, weekTotals } from "../lib/calculations";
import { fixture } from "./fixtures";

test("task, weekly and lifetime projections include all additions", () => {
  const state = fixture();
  assert.deepEqual(taskAmounts(state.tasks[0]), { hourly: 100, bonus: 7, others: 3, total: 110 });
  assert.equal(weekTotals(state, "2025-01-27").total, 125);
  assert.deepEqual(lifetimeTotals(state), { tasks: 110, bonuses: 15, projected: 125, earned: 200, hours: 2.75 });
  state.projects[0].hourlyRate = 100;
  assert.equal(taskAmounts(state.tasks[0]).hourly, 100, "saved task rates survive a project rate change");
});

test("worked hours are separate from billed hours", () => {
  const state = fixture();
  assert.equal(loggedHours(state.tasks[0], state), 2.75);
  state.projects[0].tracksWorkedHours = false;
  assert.equal(loggedHours(state.tasks[0], state), 1.25);
});

test("submission weeks honor the selected start day", () => {
  assert.equal(weekKey("2025-02-02", 1), "2025-01-27");
  assert.equal(weekKey("2025-02-02", 0), "2025-02-02");
  assert.equal(weekKey("2025-02-02", 6), "2025-02-01");
});

test("payments count in the payroll Friday month across month and year boundaries", () => {
  assert.equal(payrollMonthKey("2025-01-27"), "2025-02");
  assert.equal(payrollMonthKey("2024-12-23"), "2025-01");
  assert.equal(monthTaxSummary(fixture(), "2025-01").gross, 0);
  assert.equal(monthTaxSummary(fixture(), "2025-02").gross, 200);
});

test("independent taxes use gross, monthly roofs and exempt weeks", () => {
  const state = fixture();
  state.weeklyActualPaid["2025-02-03"] = 50;
  state.taxFreeWeeks["2025-02-03"] = true;
  state.taxes.push({ id: "tax-2", name: "Capped sample tax", percentage: 20, monthlyRoof: 100 });
  const total = monthTaxSummary(state, "2025-02");
  assert.equal(total.gross, 250);
  assert.equal(total.taxableGross, 200);
  assert.deepEqual(total.taxes.map(tax => tax.amount), [20, 20]);
  assert.equal(total.taxTotal, 40);
  assert.equal(total.net, 210);
});

test("monthly cards begin with the first working month", () => {
  assert.deepEqual(monthsFromStart(fixture(), new Date(2025, 2, 1)), ["2025-01", "2025-02", "2025-03"]);
});
