import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GET, PUT } from "../app/api/state/route";
import { emptyState } from "../lib/types";
import { fixture } from "./fixtures";

test("API reads, saves and rejects unsafe or invalid requests against a disposable database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "earnla-api-test-"));
  const previousPath = process.env.EARNLA_DB_PATH;
  process.env.EARNLA_DB_PATH = join(directory, "api-test.sqlite");
  const globalDb = globalThis as typeof globalThis & { earnlaDb?: DatabaseSync };
  const request = (body: string, origin = "http://127.0.0.1:4173") => new Request("http://localhost:4173/api/state", {
    method: "PUT", headers: { "Content-Type": "application/json", Host: "127.0.0.1:4173", Origin: origin }, body,
  });
  try {
    const fresh = GET();
    assert.equal(fresh.headers.get("cache-control"), "no-store");
    assert.deepEqual((await fresh.json()).state, emptyState());
    const state = fixture();
    const saved = await PUT(request(JSON.stringify(state)));
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).state, state);
    assert.equal((await PUT(request(JSON.stringify(emptyState()), "https://external.invalid"))).status, 403);
    assert.equal((await PUT(request("not valid JSON"))).status, 400);
    assert.equal((await PUT(request(JSON.stringify({ ...state, tasks: [{ ...state.tasks[0], projectId: "missing" }] })))).status, 400);
    assert.deepEqual((await GET().json()).state, state, "rejected requests cannot modify saved data");
  } finally {
    globalDb.earnlaDb?.close(); delete globalDb.earnlaDb;
    if (previousPath == null) delete process.env.EARNLA_DB_PATH; else process.env.EARNLA_DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
