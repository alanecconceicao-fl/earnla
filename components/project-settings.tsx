import type { EarningsState } from "@/lib/types";
import AmountInput from "./amount-input";
import { EmptyState } from "./task-table";

export type UpdateState = (update: (state: EarningsState) => EarningsState) => Promise<boolean>;

export default function ProjectSettings({ state, update, notify }: { state: EarningsState; update: UpdateState; notify: (message: string) => void }) {
  return <>
    <div className="page-heading"><div><div className="eyebrow">SET UP YOUR RATES</div><h1>Projects & settings</h1><p className="subhead">Project rates fill in new tasks. Saved tasks keep their own hourly rate.</p></div></div>
    <section className="panel settings-panel">
      <div className="section-heading"><h2>Projects</h2></div>
      <form className="project-create" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget, data = new FormData(form), name = String(data.get("name") ?? "").trim();
        if (!name) return;
        if (state.projects.some(project => project.name.toLowerCase() === name.toLowerCase())) { notify("That project already exists."); return; }
        const project = { id: crypto.randomUUID(), name, hourlyRate: Number(data.get("rate")), tracksWorkedHours: data.get("worked") === "on" };
        if (await update(current => ({ ...current, projects: [...current.projects, project] }))) { form.reset(); notify("Project added"); }
      }}>
        <label>Project name<input name="name" required maxLength={60} placeholder="e.g. Website project" /></label>
        <label>Hourly rate (USD)<input name="rate" required type="number" min="0" step="0.01" placeholder="0.00" /></label>
        <label className="project-create-toggle"><input name="worked" type="checkbox" />Track worked hours separately</label>
        <button className="primary-button" type="submit">＋ Add project</button>
      </form>
      <div className="project-list">{state.projects.length ? state.projects.map(project => <article className="project-row" key={project.id}>
        <div><strong>{project.name}</strong><small>{state.tasks.filter(task => task.projectId === project.id).length} tasks</small></div>
        <label>Hourly rate (USD)<AmountInput value={project.hourlyRate} onChange={hourlyRate => { void update(current => ({ ...current, projects: current.projects.map(item => item.id === project.id ? { ...item, hourlyRate } : item) })); }} /></label>
        <label className="project-tracking-toggle"><input type="checkbox" checked={project.tracksWorkedHours} onChange={event => {
          const tracksWorkedHours = event.target.checked;
          void update(current => ({ ...current, projects: current.projects.map(item => item.id === project.id ? { ...item, tracksWorkedHours } : item) }));
        }} />Track worked hours separately</label>
        <button className="remove-project" disabled={state.tasks.some(task => task.projectId === project.id)} title={state.tasks.some(task => task.projectId === project.id) ? "Project has tasks" : undefined} onClick={() => { void update(current => ({ ...current, projects: current.projects.filter(item => item.id !== project.id) })); }}>Remove</button>
      </article>) : <EmptyState>Add your first project above.</EmptyState>}</div>
    </section>
    <section className="panel settings-panel tax-settings">
      <div className="section-heading"><div><h2>Monthly taxes</h2><p>Each tax applies to the month’s non-exempt gross earnings in EUR. A roof caps that tax’s monthly base; weekly earnings count in the month of their payroll Friday, the Friday after the period ends.</p></div></div>
      <form className="tax-create" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget, data = new FormData(form), name = String(data.get("name") ?? "").trim();
        if (!name) return;
        const tax = { id: crypto.randomUUID(), name, percentage: Number(data.get("percentage")), monthlyRoof: data.get("roof") === "" ? null : Number(data.get("roof")) };
        if (await update(current => ({ ...current, taxes: [...current.taxes, tax] }))) { form.reset(); notify("Tax added"); }
      }}>
        <label>Tax name<input name="name" required maxLength={60} placeholder="e.g. Income tax" /></label>
        <label>Percentage<input name="percentage" required type="number" min="0" max="100" step="0.01" placeholder="25" /></label>
        <label>Monthly roof (EUR)<input name="roof" type="number" min="0" step="0.01" placeholder="Leave blank for no roof" /></label>
        <button className="primary-button" type="submit">＋ Add tax</button>
      </form>
      <div className="tax-list">{state.taxes.length ? state.taxes.map(tax => {
        const change = (patch: Partial<typeof tax>) => { void update(current => ({ ...current, taxes: current.taxes.map(item => item.id === tax.id ? { ...item, ...patch } : item) })); };
        return <article className="tax-row" key={tax.id}>
          <label>Tax name<input maxLength={60} defaultValue={tax.name} onBlur={event => { const name = event.target.value.trim(); if (name && name !== tax.name) change({ name }); else event.target.value = tax.name; }} /></label>
          <label>Percentage (%)<AmountInput value={tax.percentage} max={100} onChange={percentage => change({ percentage })} /></label>
          <label>Monthly roof (EUR)<input type="number" min="0" step="0.01" placeholder="No roof" defaultValue={tax.monthlyRoof ?? ""} onBlur={event => {
            if (!event.target.validity.valid) { event.target.value = tax.monthlyRoof?.toFixed(2) ?? ""; return; }
            const monthlyRoof = event.target.value === "" ? null : Number(event.target.value);
            if (monthlyRoof !== tax.monthlyRoof) change({ monthlyRoof });
          }} /></label>
          <button className="remove-tax" aria-label={`Remove ${tax.name}`} onClick={() => { void update(current => ({ ...current, taxes: current.taxes.filter(item => item.id !== tax.id) })); }}>Remove</button>
        </article>;
      }) : <EmptyState>No taxes configured. Add one above.</EmptyState>}</div>
    </section>
    <section className="panel settings-panel global-settings">
      <div className="section-heading"><div><h2>Week settings</h2><p>Task rates and projected totals are in USD; actual earnings are in EUR.</p></div></div>
      <div className="global-fields"><label>Week starts on<select value={state.settings.weekStart} onChange={event => {
        const weekStart = Number(event.target.value);
        void update(current => ({ ...current, settings: { ...current.settings, weekStart } }));
      }}><option value="1">Monday</option><option value="0">Sunday</option><option value="6">Saturday</option></select></label></div>
    </section>
  </>;
}
