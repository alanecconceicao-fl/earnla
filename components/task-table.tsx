import { money, shortDate, taskAmounts } from "@/lib/calculations";
import type { EarningsState, Task } from "@/lib/types";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><strong>{children}</strong></div>;
}

export default function TaskTable({ state, tasks, onEdit }: { state: EarningsState; tasks: Task[]; onEdit: (task: Task) => void }) {
  const includesWorked = tasks.some(task => state.projects.find(project => project.id === task.projectId)?.tracksWorkedHours);
  return <div className="table-wrap"><table className="task-table">
    <thead><tr><th>TASK</th><th>PROJECT</th><th>SUBMITTED</th><th className="numeric">HOURS BILLED</th>{includesWorked && <th className="numeric">HOURS WORKED</th>}<th className="numeric">HOURLY (USD)</th><th className="numeric">BONUS (USD)</th><th className="numeric">OTHERS (USD)</th><th className="numeric">PROJECTED (USD)</th><th><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>{tasks.map(task => {
      const project = state.projects.find(project => project.id === task.projectId);
      const amount = taskAmounts(task);
      return <tr key={task.id}>
        <td className="task-name">{task.name}</td><td>{project?.name ?? "Unassigned"}</td><td>{shortDate(task.date)}</td>
        <td className="numeric">{task.hours.toFixed(2)}</td>
        {includesWorked && <td className="numeric">{project?.tracksWorkedHours && task.hoursWorked != null ? task.hoursWorked.toFixed(2) : "—"}</td>}
        <td className="numeric">{money(amount.hourly)}</td><td className="numeric">{money(amount.bonus)}</td><td className="numeric">{money(amount.others)}</td><td className="numeric total-cell">{money(amount.total)}</td>
        <td><button className="row-menu" onClick={() => onEdit(task)} aria-label={`Edit ${task.name}`} title="Edit task">···</button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
