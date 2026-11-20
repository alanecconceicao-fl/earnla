"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDays, asDate, lifetimeTotals, localDate, money, monthKey, monthLabel, monthsFromStart,
  monthTaxSummary, weekKey, weekKeys, weekRange, weekTasks, weekTotals,
} from "@/lib/calculations";
import { parseBackup, parseState } from "@/lib/state";
import type { EarningsState, Task } from "@/lib/types";
import AmountInput from "./amount-input";
import ProjectSettings, { type UpdateState } from "./project-settings";
import TaskModal from "./task-modal";
import TaskTable, { EmptyState } from "./task-table";

type View = "overview" | "monthly" | "tasks" | "projects";
const views: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "▦" }, { id: "monthly", label: "Monthly", icon: "▤" },
  { id: "tasks", label: "Tasks", icon: "◷" }, { id: "projects", label: "Projects & settings", icon: "⚙" },
];

export default function EarningsApp() {
  const [state, setState] = useState<EarningsState | null>(null);
  const stateRef = useRef<EarningsState | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<{ task: Task | null } | null>(null);
  const [pendingImport, setPendingImport] = useState<EarningsState | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importFile = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const revision = useRef(0);

  const notify = useCallback((text: string) => setMessage(text), []);
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load SQLite data.");
      const result = await response.json();
      const next = parseState(result.state);
      stateRef.current = next; setState(next);
      setSelectedWeek(weekKey(new Date(), next.settings.weekStart));
      // SQLite is authoritative. Remove obsolete browser copies; never restore them automatically.
      try {
        ["earnla.v2", "earnla.v1", "earnwell.v2", "earnwell.v1"].forEach(key => localStorage.removeItem(key));
      } catch { /* Browser storage can be disabled; the app does not depend on it. */ }
    } catch {
      setLoadError("Could not load the database. Check that the local server is running, then try again.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update: UpdateState = useCallback(async change => {
    if (!stateRef.current) return false;
    let next: EarningsState;
    try { next = parseState(change(stateRef.current)); }
    catch (error) { notify(error instanceof Error ? error.message : "Invalid data."); return false; }
    stateRef.current = next; setState(next);
    const snapshot = JSON.stringify(next), currentRevision = ++revision.current;
    const pending = queue.current.catch(() => false).then(async () => {
      try {
        const response = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: snapshot });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Could not save to SQLite.");
        }
        if (currentRevision === revision.current) setSaveError("");
        return true;
      } catch {
        setSaveError("Changes have not been saved to SQLite. Keep this page open and retry saving.");
        return false;
      }
    });
    queue.current = pending;
    return pending;
  }, [notify]);

  function addTask() {
    if (!state?.projects.length) { setView("projects"); notify("Add a project first."); return; }
    setModal({ task: null });
  }

  async function importData(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error("Backup is too large (maximum 5 MB).");
      const next = parseBackup(JSON.parse(await file.text()));
      setPendingImport(next);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not import that JSON file."); }
  }

  function exportData() {
    if (!state) return;
    const blob = new Blob([JSON.stringify({ version: 2, ...state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `earnla-backup-${localDate()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const selectedKey = state && selectedWeek ? weekKey(selectedWeek, state.settings.weekStart) : "";
  const totals = state ? lifetimeTotals(state) : null;
  const currentMonth = monthKey();
  const monthTotals = state ? monthTaxSummary(state, currentMonth) : null;
  const selectedTotals = state && selectedKey ? weekTotals(state, selectedKey) : null;
  const selectedTasks = state && selectedKey ? weekTasks(state, selectedKey) : [];
  const currentKey = state ? weekKey(new Date(), state.settings.weekStart) : "";

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setView("overview"); }}><span className="brand-mark">e</span>Earnla</a>
      <div className="nav-label">WORKSPACE</div>
      {views.map(item => <button key={item.id} className={`nav-item${view === item.id ? " active" : ""}`} aria-label={item.label} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}>{item.icon} <span>{item.label}</span>{item.id === "tasks" && <b>{state?.tasks.length ?? 0}</b>}</button>)}
      <div className="sidebar-bottom"><span className="privacy-dot">●</span><div><strong>Private by default</strong><small>Saved in local SQLite</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{views.find(item => item.id === view)?.label}</strong></div>
        <div className="top-actions"><span className="local-badge">SQLITE</span>
          <input type="file" ref={importFile} accept="application/json,.json" hidden aria-label="Import backup file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importData(file); }} />
          <button className="icon-button" title="Import an Earnla JSON backup" disabled={!state || loading} onClick={() => importFile.current?.click()}>Import</button>
          <button className="icon-button" title="Export backup" disabled={!state || loading} onClick={exportData}>Export</button>
        </div>
      </header>
      {saveError && <div className="save-error" role="alert">{saveError} <button className="secondary-button" onClick={() => { void update(current => current); }}>Retry save</button></div>}
      {loading ? <section className="page"><p role="status">Loading Earnla…</p></section> : loadError ? <section className="page"><p role="alert">{loadError}</p><button className="primary-button" onClick={() => { void load(); }}>Try again</button></section> : state && totals && monthTotals && selectedTotals && <section className="page">
        {view === "overview" && <>
          <div className="page-heading"><div><div className="eyebrow">YOUR EARNINGS</div><h1>Earnings overview</h1><p className="subhead">Track projected task earnings against what you actually receive.</p></div><button className="primary-button" onClick={addTask}><span>＋</span> Add task</button></div>
          <div className="metric-grid">
            <article className="metric-card earned-card"><div className="metric-label">ALL-TIME TOTAL EARNED (EUR)</div><div className="metric-value">{money(totals.earned, "EUR")}</div><div className="metric-foot">Actual amounts paid across all weeks</div></article>
            <article className="metric-card projected-card"><div className="metric-label">ALL-TIME TOTAL PROJECTED (USD)</div><div className="metric-value">{money(totals.projected)}</div><div className="metric-foot">{money(totals.tasks)} task totals + {money(totals.bonuses)} weekly bonuses</div></article>
            <article className="metric-card month-card"><div className="metric-label">THIS MONTH NET (EUR) · {monthLabel(currentMonth).toUpperCase()}</div><div className="metric-value">{money(monthTotals.net, "EUR")}</div><div className="metric-foot">{money(monthTotals.taxTotal, "EUR")} taxes · {money(monthTotals.gross, "EUR")} gross</div></article>
            <article className="metric-card"><div className="metric-label">HOURS WORKED / BILLED</div><div className="metric-value">{totals.hours.toFixed(2)}</div><div className="metric-foot">Worked hours where tracked; billed hours otherwise</div></article>
          </div>
          <div className="week-toolbar"><div className="week-control">
            <button className="week-arrow" aria-label="Previous week" onClick={() => setSelectedWeek(localDate(addDays(asDate(selectedKey), -7)))}>‹</button>
            <div><div className="week-title">{selectedKey === currentKey ? "This week" : selectedKey > currentKey ? "Upcoming week" : "Past week"}</div><div className="week-range">{weekRange(selectedKey)}</div></div>
            <button className="week-arrow" aria-label="Next week" onClick={() => setSelectedWeek(localDate(addDays(asDate(selectedKey), 7)))}>›</button>
          </div><button className="text-button" onClick={() => setSelectedWeek(currentKey)}>Jump to this week</button></div>
          <section className="panel week-summary">
            <div className="week-total">
              <WeekFields key={selectedKey} state={state} week={selectedKey} update={update}>
                <div className="week-projection"><span className="eyebrow">SELECTED WEEK PROJECTED (USD)</span><strong>{money(selectedTotals.total)}</strong><small>Task earnings plus this week’s bonus</small></div>
              </WeekFields>
            </div>
            <div className="table-wrap"><table className="breakdown-table"><thead><tr><th>PROJECT</th><th>HOURLY (USD)</th><th>BONUS (USD)</th><th>OTHERS (USD)</th><th className="right">PROJECTED (USD)</th></tr></thead><tbody>
              {selectedTotals.byProject.length ? selectedTotals.byProject.map(row => <tr key={row.name}><td>{row.name}</td><td>{money(row.hourly)}</td><td>{money(row.bonus)}</td><td>{money(row.others)}</td><td className="right">{money(row.total)}</td></tr>) : <tr><td className="empty-cell" colSpan={5}>No tasks this week yet.</td></tr>}
              <tr className="weekly-bonus-row"><td colSpan={4}>Weekly bonus (USD)</td><td className="right">{money(selectedTotals.bonus)}</td></tr>
              <tr className="weekly-grand-row"><td colSpan={4}>Projected total (USD)</td><td className="right">{money(selectedTotals.total)}</td></tr>
              <tr className="weekly-earned-row"><td colSpan={4}>Actual amount earned (EUR)</td><td className="right">{money(state.weeklyActualPaid[selectedKey] ?? 0, "EUR")}</td></tr>
            </tbody></table></div>
          </section>
          <section className="panel tasks-panel"><div className="section-heading"><div><h2>Tasks this week</h2><p>Grouped by submission date and project rate.</p></div><button className="text-button" onClick={() => setView("tasks")}>All weeks</button></div>
            {selectedTasks.length ? <TaskTable state={state} tasks={selectedTasks} onEdit={task => setModal({ task })} /> : <EmptyState>No tasks this week yet. Add one to start tracking your earnings.</EmptyState>}
          </section>
          <footer className="page-footer">Task rates, bonuses and projections are in USD. Actual amounts earned are recorded in EUR.</footer>
        </>}
        {view === "monthly" && <>
          <div className="page-heading"><div><div className="eyebrow">YOUR EARNINGS, MONTH BY MONTH</div><h1>Monthly earnings</h1><p className="subhead">Net actual earnings, taxes and gross amounts in EUR.</p></div></div>
          <div className="monthly-grid">{monthsFromStart(state).map(key => {
            const month = monthTaxSummary(state, key);
            return <article className="monthly-card" key={key}><div className="eyebrow">{monthLabel(key).toUpperCase()}</div><div className="monthly-net-label">NET EARNED (EUR)</div><strong className="monthly-net">{money(month.net, "EUR")}</strong><div className="monthly-detail"><span>Taxes</span><strong>{money(month.taxTotal, "EUR")}</strong><span>Gross earned</span><strong>{money(month.gross, "EUR")}</strong></div></article>;
          })}</div>
        </>}
        {view === "tasks" && <>
          <div className="page-heading"><div><div className="eyebrow">YOUR WORK, WEEK BY WEEK</div><h1>Task log</h1><p className="subhead">Every task, grouped by its submission week.</p></div><button className="primary-button" onClick={addTask}><span>＋</span> Add task</button></div>
          {weekKeys(state).length ? weekKeys(state).map(key => {
            const tasks = weekTasks(state, key), total = weekTotals(state, key);
            return <section className="panel week-group" key={key}><div className="group-heading">
              <div><h2>{weekRange(key)}</h2><p>{tasks.length} task{tasks.length === 1 ? "" : "s"} · {total.hoursWorked.toFixed(2)} logged hours{total.hoursBilled !== total.hoursWorked ? ` · ${total.hoursBilled.toFixed(2)} billed` : ""}</p></div>
              <WeekFields state={state} week={key} update={update} />
              <div className="week-projection compact-projection"><small>PROJECTED (USD)</small><strong className="group-total">{money(total.total)}</strong></div>
            </div>{tasks.length ? <TaskTable state={state} tasks={tasks} onEdit={task => setModal({ task })} /> : <EmptyState>No tasks recorded for this week.</EmptyState>}</section>;
          }) : <section className="panel"><EmptyState>No tasks yet. Add a task to build your weekly log.</EmptyState></section>}
        </>}
        {view === "projects" && <ProjectSettings state={state} update={update} notify={notify} />}
      </section>}
    </main>
    {modal && state && <TaskModal task={modal.task} projects={state.projects} onClose={closeModal} onSave={async task => {
      const saved = await update(current => ({ ...current, tasks: current.tasks.some(item => item.id === task.id) ? current.tasks.map(item => item.id === task.id ? task : item) : [...current.tasks, task] }));
      if (saved) notify(modal.task ? "Task updated" : "Task added");
      return saved;
    }} onDelete={async id => {
      const saved = await update(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }));
      if (saved) notify("Task deleted");
      return saved;
    }} />}
    {pendingImport && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="modal-head"><h2 id="import-title">Import backup?</h2></div>
      <p>Import {pendingImport.projects.length} projects and {pendingImport.tasks.length} tasks? This replaces the current Earnla data.</p>
      <div className="modal-actions">
        <button className="secondary-button" disabled={importBusy} onClick={() => setPendingImport(null)}>Cancel</button>
        <button className="primary-button" disabled={importBusy} onClick={async () => {
          setImportBusy(true);
          if (await update(() => pendingImport)) {
            setSelectedWeek(weekKey(new Date(), pendingImport.settings.weekStart));
            setModal(null); setPendingImport(null); notify("JSON data imported into SQLite");
          }
          setImportBusy(false);
        }}>{importBusy ? "Importing…" : "Import backup"}</button>
      </div>
    </section></div>}
    <div className={`toast${message ? " show" : ""}`} role="status">{message}</div>
  </div>;
}

function WeekFields({ state, week, update, children }: { state: EarningsState; week: string; update: UpdateState; children?: React.ReactNode }) {
  function changeAmount(field: "weeklyBonuses" | "weeklyActualPaid", value: number) {
    void update(current => {
      const amounts = { ...current[field] };
      if (value) amounts[week] = value; else delete amounts[week];
      return { ...current, [field]: amounts };
    });
  }
  return <>
    <label className="weekly-paid-field featured-paid-field">Actual amount earned (EUR)<AmountInput value={state.weeklyActualPaid[week] ?? 0} onChange={value => changeAmount("weeklyActualPaid", value)} /></label>
    {children}
    <label className="weekly-bonus-field">Weekly bonus (USD)<AmountInput value={state.weeklyBonuses[week] ?? 0} onChange={value => changeAmount("weeklyBonuses", value)} /></label>
    <label className="tax-free-toggle"><input type="checkbox" checked={state.taxFreeWeeks[week] === true} onChange={event => {
      const checked = event.target.checked;
      void update(current => {
        const taxFreeWeeks = { ...current.taxFreeWeeks };
        if (checked) taxFreeWeeks[week] = true; else delete taxFreeWeeks[week];
        return { ...current, taxFreeWeeks };
      });
    }} />Tax-free week</label>
  </>;
}
