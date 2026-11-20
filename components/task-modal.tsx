import { useEffect, useRef, useState } from "react";
import { localDate, money, taskAmounts } from "@/lib/calculations";
import type { Project, Task } from "@/lib/types";

export default function TaskModal({ task, projects, onClose, onSave, onDelete }: {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onSave: (task: Task) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => ({
    id: task?.id ?? crypto.randomUUID(), projectId: task?.projectId ?? "", name: task?.name ?? "",
    hours: task?.hours.toFixed(2) ?? "", hourlyRate: task?.hourlyRate.toString() ?? "",
    hoursWorked: task?.hoursWorked?.toFixed(2) ?? "", date: task?.date ?? localDate(),
    bonusAmount: task?.bonusAmount.toFixed(2) ?? "0.00", othersAmount: task?.othersAmount.toFixed(2) ?? "0.00",
  }));
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const project = projects.find(project => project.id === draft.projectId);
  const estimate = taskAmounts({ hours: Number(draft.hours) || 0, hourlyRate: Number(draft.hourlyRate) || 0, bonusAmount: Number(draft.bonusAmount) || 0, othersAmount: Number(draft.othersAmount) || 0 });
  useEffect(() => {
    nameInput.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  function field(key: keyof typeof draft, value: string) { setDraft(current => ({ ...current, [key]: value })); }
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><div className="eyebrow">TASK DETAILS</div><h2 id="modal-title">{task ? "Edit task" : "Add a task"}</h2></div><button className="close-button" onClick={onClose} aria-label="Close" disabled={busy}>×</button></div>
      <form onSubmit={async event => {
        event.preventDefault();
        if (!draft.name.trim()) return;
        setBusy(true);
        const saved = await onSave({
          ...draft, name: draft.name.trim(), hours: Math.round(Number(draft.hours) * 100) / 100,
          hourlyRate: Number(draft.hourlyRate),
          hoursWorked: project?.tracksWorkedHours ? Math.round(Number(draft.hoursWorked) * 100) / 100 : task?.hoursWorked ?? null,
          bonusAmount: Number(draft.bonusAmount) || 0, othersAmount: Number(draft.othersAmount) || 0,
        });
        setBusy(false);
        if (saved) onClose();
      }}>
        <label>Project<select required value={draft.projectId} onChange={event => {
          const id = event.target.value, selected = projects.find(project => project.id === id);
          setDraft(current => ({ ...current, projectId: id, hourlyRate: String(selected && task?.projectId === id ? task.hourlyRate : selected?.hourlyRate ?? "") }));
        }}><option value="">Choose a project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Task name<input ref={nameInput} required maxLength={100} placeholder="What did you work on?" value={draft.name} onChange={event => field("name", event.target.value)} /></label>
        <div className="form-grid">
          <label>Hourly rate (USD)<input type="number" required min="0" step="any" value={draft.hourlyRate} onChange={event => field("hourlyRate", event.target.value)} /></label>
          <label>Submission date<input type="date" required value={draft.date} onChange={event => field("date", event.target.value)} /></label>
        </div>
        <div className="form-grid">
          <label>Hours billed<input type="number" required min="0" step="0.01" placeholder="0.00" value={draft.hours} onChange={event => field("hours", event.target.value)} onBlur={() => { if (draft.hours !== "") field("hours", Number(draft.hours).toFixed(2)); }} /></label>
          {project?.tracksWorkedHours && <label>Hours worked<input type="number" required min="0" step="0.01" placeholder="0.00" value={draft.hoursWorked} onChange={event => field("hoursWorked", event.target.value)} onBlur={() => { if (draft.hoursWorked !== "") field("hoursWorked", Number(draft.hoursWorked).toFixed(2)); }} /></label>}
        </div>
        <div className="form-grid">
          <label>Bonus amount (USD)<input type="number" min="0" step="0.01" placeholder="0.00" value={draft.bonusAmount} onChange={event => field("bonusAmount", event.target.value)} /></label>
          <label>Others amount (USD)<input type="number" min="0" step="0.01" placeholder="0.00" value={draft.othersAmount} onChange={event => field("othersAmount", event.target.value)} /></label>
        </div>
        <div className="estimate-box"><span>Projected task total (USD)</span><strong>{money(estimate.total)}</strong><small>{project ? `${Number(draft.hours).toFixed(2)} billed h × ${money(Number(draft.hourlyRate) || 0)}/h + ${money(estimate.bonus)} bonus + ${money(estimate.others)} others` : "Choose a project to fill in the hourly rate."}</small></div>
        <div className="modal-actions">
          {task && <button type="button" className="danger-button" disabled={busy} onClick={async () => { setBusy(true); const saved = await onDelete(task.id); setBusy(false); if (saved) onClose(); }}>Delete task</button>}
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save task"}</button>
        </div>
      </form>
    </section>
  </div>;
}
