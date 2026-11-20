import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readState, saveState } from "../lib/database";
import { migrate, openDatabase } from "../lib/migrations";
import { emptyState } from "../lib/types";
import { fixture } from "./fixtures";

test("migration creates an empty database, is repeatable and persists across reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "earnla-test-"));
  try {
    const path = join(directory, "nested", "test.sqlite");
    let db = openDatabase(path);
    for (const table of ["settings", "projects", "tasks", "weekly_bonuses", "weekly_actual_paid", "weekly_tax_free", "taxes"]) {
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count, 0, `${table} must have no seed records`);
    }
    assert.deepEqual(readState(db), emptyState());
    migrate(db);
    assert.equal(db.prepare("SELECT count(*) AS count FROM schema_migrations").get()?.count, 1);
    const state = fixture();
    state.taxFreeWeeks["2025-01-27"] = true;
    assert.deepEqual(saveState(db, state), state);
    db.close();
    db = openDatabase(path);
    assert.deepEqual(readState(db), state);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("missing rates on existing tasks keep their historical rate; new tasks use project defaults", () => {
  const db = openDatabase(":memory:");
  try {
    const state = fixture();
    saveState(db, state);
    state.projects[0].hourlyRate = 100;
    const { hourlyRate: _oldRate, ...oldTask } = state.tasks[0];
    const saved = saveState(db, { ...state, tasks: [oldTask, { ...oldTask, id: "task-2" }] });
    assert.equal(saved.tasks[0].hourlyRate, 80);
    assert.equal(saved.tasks[1].hourlyRate, 100);
  } finally { db.close(); }
});

test("invalid imports and failed writes cannot erase existing data", () => {
  const db = openDatabase(":memory:");
  try {
    const state = fixture();
    saveState(db, state);
    assert.throws(() => saveState(db, { ...state, tasks: [{ ...state.tasks[0], projectId: "missing" }] }));
    assert.deepEqual(readState(db), state);
    db.exec("CREATE TRIGGER test_write_failure BEFORE INSERT ON tasks WHEN NEW.name = 'Rejected fixture' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    assert.throws(() => saveState(db, { ...state, tasks: [{ ...state.tasks[0], name: "Rejected fixture" }] }));
    assert.deepEqual(readState(db), state);
  } finally { db.close(); }
});
