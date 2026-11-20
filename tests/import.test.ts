import assert from "node:assert/strict";
import test from "node:test";
import { parseBackup, parseState } from "../lib/state";
import { fixture } from "./fixtures";

test("current JSON exports round-trip every supported field", () => {
  const state = fixture();
  state.projects[0].hourlyRate = 100;
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify({ version: 2, ...state }))), state);
});

test("old exports without task rates use the rates from their own project data", () => {
  const state = fixture();
  const { hourlyRate: _rate, ...task } = state.tasks[0];
  assert.equal(parseBackup({ ...state, tasks: [task] }).tasks[0].hourlyRate, 80);
});

test("legacy JSON imports convert project names and flat payments explicitly", () => {
  const state = parseBackup({
    settings: { weekStart: 1, projects: [{ name: "Legacy sample project", hourlyRate: 30, acceptedFlat: 12, rejectedFlat: 5 }] },
    tasks: [{ name: "Legacy sample task", project: "Legacy sample project", hours: 2.25, submittedAt: "2025-01-27T10:00:00Z", status: "accepted", bonus: 4 }],
  });
  assert.equal(state.tasks[0].hourlyRate, 30);
  assert.equal(state.tasks[0].othersAmount, 12);
  assert.equal(state.tasks[0].bonusAmount, 4);
  assert.equal(state.tasks[0].projectId, state.projects[0].id);
  assert.deepEqual(state.taxes, [], "no personal tax presets may appear during import");
});

test("unknown backup properties are not carried into stored or exported data", () => {
  const state = fixture();
  assert.deepEqual(parseState({ ...state, unrelatedMetadata: "discard", projects: state.projects.map(project => ({ ...project, unrelatedMetadata: "discard" })) }), state);
});

test("invalid dates, nonfinite amounts, duplicate IDs and broken projects are rejected", () => {
  const state = fixture();
  for (const patch of [{ date: "2025-02-30" }, { hours: Infinity }, { bonusAmount: NaN }, { projectId: "unknown" }]) {
    assert.throws(() => parseState({ ...state, tasks: [{ ...state.tasks[0], ...patch }] }));
  }
  assert.throws(() => parseState({ ...state, tasks: [state.tasks[0], state.tasks[0]] }));
  assert.throws(() => parseState({ ...state, taxes: [{ ...state.taxes[0], percentage: 101 }] }));
});
