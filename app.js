(() => {
  const KEY = 'earnla.v2';
  const OLD_KEY = 'earnla.v1';
  // Read the former browser keys so existing local records carry over.
  const LEGACY_KEY = 'earnwell.v2';
  const LEGACY_OLD_KEY = 'earnwell.v1';
  const $ = id => document.getElementById(id);
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => localDate(new Date());
  const defaults = { settings: { currency: 'USD', weekStart: 1, taxesInitialized: false }, projects: [], tasks: [], weeklyBonuses: {}, weeklyActualPaid: {}, taxes: [], taxFreeWeeks: {} };
  const initialTaxes = [
    { id: 'tax-irs', name: 'IRS', percentage: 25, monthlyRoof: null },
    { id: 'tax-ss', name: 'SS', percentage: 21.4, monthlyRoof: 6445.56 }
  ];

  function load() {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY));
      if (current) {
        const normalized = normalize(current);
        if (!current.migrationReviewed) {
          const old = JSON.parse(localStorage.getItem(OLD_KEY) || localStorage.getItem(LEGACY_OLD_KEY));
          if (old) {
            const oldTasks = old.tasks || [], oldProjects = old.settings?.projects || [];
            normalized.tasks.forEach(task => {
              const sourceTask = oldTasks.find(item => String(item.id) === task.id);
              if (!sourceTask || sourceTask.othersAmount != null || sourceTask.others != null) return;
              const sourceProject = oldProjects.find(item => String(item.name).toLowerCase() === String(sourceTask.project).toLowerCase());
              task.othersAmount = n(sourceTask.status === 'rejected' ? sourceProject?.rejectedFlat : sourceProject?.acceptedFlat);
            });
          }
          normalized.migrationReviewed = true;
        }
        localStorage.setItem(KEY, JSON.stringify(normalized));
        return normalized;
      }
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || localStorage.getItem(LEGACY_OLD_KEY));
      if (!old) return structuredClone(defaults);
      const projects = (old.settings?.projects || []).map(project => ({ id: project.id || crypto.randomUUID(), name: project.name, hourlyRate: n(project.hourlyRate), tracksWorkedHours: Boolean(project.tracksWorkedHours) }));
      const findProject = name => projects.find(project => project.name.toLowerCase() === String(name || '').toLowerCase());
      const tasks = (old.tasks || []).map(task => {
        const project = findProject(task.project);
        const legacyProject = (old.settings?.projects || []).find(item => String(item.name).toLowerCase() === String(task.project || '').toLowerCase());
        const legacyOthers = task.othersAmount ?? task.others ?? ((task.status === 'rejected' ? legacyProject?.rejectedFlat : legacyProject?.acceptedFlat) || 0);
        return {
          id: task.id || crypto.randomUUID(), projectId: project?.id || '', name: task.name || 'Task', hours: n(task.hours),
          date: localDate(task.submittedAt || task.date || new Date()), hourlyRate: task.hourlyRate, bonusAmount: n(task.bonusAmount ?? task.bonus),
          othersAmount: n(legacyOthers)
        };
      });
      const migrated = normalize({ settings: { currency: old.settings?.currency || 'USD', weekStart: old.settings?.weekStart ?? 1 }, projects, tasks, weeklyBonuses: {} });
      migrated.migrationReviewed = true;
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch { return structuredClone(defaults); }
  }
  function normalize(data) {
    const projects = Array.isArray(data.projects) ? data.projects.map(p => ({ id: String(p.id || crypto.randomUUID()), name: String(p.name || 'Project'), hourlyRate: n(p.hourlyRate), tracksWorkedHours: p.tracksWorkedHours == null ? String(p.name || '').trim().toLowerCase() === 'code behaviors' : Boolean(p.tracksWorkedHours) })) : [];
    const projectRates = new Map(projects.map(project => [project.id, project.hourlyRate]));
    const tasks = Array.isArray(data.tasks) ? data.tasks.map(task => {
      const projectId = String(task.projectId || '');
      const hourlyRate = task.hourlyRate == null || task.hourlyRate === '' ? projectRates.get(projectId) : task.hourlyRate;
      return {
        id: String(task.id || crypto.randomUUID()),
        projectId,
        name: String(task.name || 'Task'),
        hours: Math.max(0, n(task.hours)),
        hourlyRate: Math.max(0, n(hourlyRate)),
        hoursWorked: task.hoursWorked == null || task.hoursWorked === '' ? null : Math.max(0, n(task.hoursWorked)),
        date: String(task.date || today()).slice(0, 10),
        bonusAmount: Math.max(0, n(task.bonusAmount)),
        othersAmount: Math.max(0, n(task.othersAmount))
      };
    }) : [];
    const taxes = Array.isArray(data.taxes) ? data.taxes.map(tax => ({ id: String(tax.id || crypto.randomUUID()), name: String(tax.name || 'Tax'), percentage: Math.max(0, n(tax.percentage)), monthlyRoof: tax.monthlyRoof == null || tax.monthlyRoof === '' ? null : Math.max(0, n(tax.monthlyRoof)) })) : [];
    return { settings: { currency: 'USD', weekStart: Number(data.settings?.weekStart ?? 1), taxesInitialized: Boolean(data.settings?.taxesInitialized) }, projects, tasks, weeklyBonuses: data.weeklyBonuses && typeof data.weeklyBonuses === 'object' ? data.weeklyBonuses : {}, weeklyActualPaid: data.weeklyActualPaid && typeof data.weeklyActualPaid === 'object' ? data.weeklyActualPaid : {}, taxes, taxFreeWeeks: data.taxFreeWeeks && typeof data.taxFreeWeeks === 'object' ? data.taxFreeWeeks : {} };
  }

  let state = structuredClone(defaults);
  let selectedWeek = weekStart(new Date());
  let toastTimer;
  let backendReady = false;
  let saveQueue = Promise.resolve();

  function save() {
    const snapshot = JSON.stringify(state);
    try { localStorage.setItem(KEY, snapshot); } catch {}
    if (!backendReady) return Promise.resolve(false);
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot });
      if (!response.ok) throw new Error(`SQLite save failed (${response.status})`);
      return true;
    }).catch(() => { toast('Could not save to SQLite. Your browser still has a local copy.'); return false; });
    return saveQueue;
  }
  function projectById(id) { return state.projects.find(project => project.id === id) || null; }
  function money(value, currency = 'USD') {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value)); }
    catch { return `${currency} ${n(value).toFixed(2)}`; }
  }
  function localDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(+date)) return todaySafe();
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function todaySafe() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function asDate(value) { const [y, m, d] = String(value).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function weekStart(date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() - Number(state.settings.weekStart) + 7) % 7);
    return d;
  }
  function weekKey(date) { return localDate(weekStart(date)); }
  function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
  function weekRange(start) {
    const end = addDays(start, 6);
    const left = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start);
    const right = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(end);
    return `${left} – ${right}`;
  }
  function shortDate(value) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(asDate(value)); }
  function taskAmounts(task) {
    const hourly = task.hours * task.hourlyRate;
    const bonus = n(task.bonusAmount), others = n(task.othersAmount);
    return { hourly, bonus, others, total: hourly + bonus + others };
  }
  function weekTasks(key) { return state.tasks.filter(task => weekKey(asDate(task.date)) === key); }
  function weeklyBonus(key) { return n(state.weeklyBonuses[key]); }
  function actualPaid(key) { return n(state.weeklyActualPaid[key]); }
  function isTaxFree(key) { return state.taxFreeWeeks[key] === true; }
  function monthKey(date) { const d = date instanceof Date ? date : asDate(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  function monthLabel(key) { const [year, month] = key.split('-').map(Number); return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
  function payrollMonthKey(week) {
    const periodEnd = addDays(asDate(week), 6);
    let daysUntilFriday = (5 - periodEnd.getDay() + 7) % 7;
    if (daysUntilFriday === 0) daysUntilFriday = 7;
    return monthKey(addDays(periodEnd, daysUntilFriday));
  }
  function monthTaxSummary(key) {
    let gross = 0, taxableGross = 0;
    for (const [week, amount] of Object.entries(state.weeklyActualPaid)) {
      if (payrollMonthKey(week) !== key) continue;
      const value = n(amount); gross += value;
      if (!isTaxFree(week)) taxableGross += value;
    }
    const taxes = state.taxes.map(tax => {
      const base = tax.monthlyRoof == null ? taxableGross : Math.min(taxableGross, n(tax.monthlyRoof));
      return { ...tax, base, amount: Math.round(base * n(tax.percentage)) / 100 };
    });
    const taxTotal = taxes.reduce((sum, tax) => sum + tax.amount, 0);
    return { gross, taxableGross, taxes, taxTotal, net: gross - taxTotal };
  }
  function weekTotals(key) {
    const byProject = new Map();
    let hoursBilled = 0, hoursWorked = 0, taskTotal = 0, taskBonus = 0, others = 0, hourly = 0;
    for (const task of weekTasks(key)) {
      const project = projectById(task.projectId), name = project?.name || 'Unassigned project';
      const amount = taskAmounts(task); hoursBilled += task.hours; hoursWorked += loggedHours(task); taskTotal += amount.total; taskBonus += amount.bonus; others += amount.others; hourly += amount.hourly;
      const item = byProject.get(name) || { name, hourly: 0, bonus: 0, others: 0, total: 0 };
      item.hourly += amount.hourly; item.bonus += amount.bonus; item.others += amount.others; item.total += amount.total; byProject.set(name, item);
    }
    const bonus = weeklyBonus(key);
    return { byProject: [...byProject.values()], hoursBilled, hoursWorked, taskTotal, taskBonus, others, hourly, bonus, total: taskTotal + bonus };
  }
  function loggedHours(task) { const project = projectById(task.projectId); return project?.tracksWorkedHours ? n(task.hoursWorked) : n(task.hours); }
  function setView(view) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    $(`${view}-view`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('page-crumb').textContent = view === 'overview' ? 'Overview' : view === 'monthly' ? 'Monthly' : view === 'tasks' ? 'Tasks' : 'Projects & settings';
    if (view === 'overview') renderOverview();
    if (view === 'monthly') renderMonthly();
    if (view === 'tasks') renderAllWeeks();
    if (view === 'projects') { renderProjects(); renderTaxes(); }
  }
  function renderMetrics() {
    const lifetime = state.tasks.reduce((sum, task) => sum + taskAmounts(task).total, 0);
    const lifetimeHours = state.tasks.reduce((sum, task) => sum + loggedHours(task), 0);
    const weeklyBonuses = Object.values(state.weeklyBonuses).reduce((sum, amount) => sum + n(amount), 0);
    $('all-time-projected').textContent = money(lifetime + weeklyBonuses);
    $('lifetime-total-detail').textContent = `${money(lifetime)} task totals + ${money(weeklyBonuses)} weekly bonuses`;
    $('all-time-earned').textContent = money(Object.values(state.weeklyActualPaid).reduce((sum, amount) => sum + n(amount), 0), 'EUR');
    $('all-time-hours').textContent = lifetimeHours.toFixed(2);
    $('task-count').textContent = state.tasks.length;
    const currentMonth = monthKey(new Date()), monthTotals = monthTaxSummary(currentMonth);
    $('current-month-label').textContent = `THIS MONTH NET (EUR) · ${monthLabel(currentMonth).toUpperCase()}`;
    $('current-month-total').textContent = money(monthTotals.net, 'EUR');
    $('current-month-detail').textContent = `${money(monthTotals.taxTotal, 'EUR')} taxes · ${money(monthTotals.gross, 'EUR')} gross`;
  }
  function monthKeysFromStart() {
    const current = monthKey(new Date());
    const activityWeeks = [
      ...state.tasks.map(task => weekKey(asDate(task.date))),
      ...Object.keys(state.weeklyActualPaid),
      ...Object.keys(state.weeklyBonuses),
      ...Object.keys(state.taxFreeWeeks)
    ].sort();
    const first = activityWeeks[0]?.slice(0, 7) || current;
    const [firstYear, firstMonth] = first.split('-').map(Number);
    const [currentYear, currentMonthNumber] = current.split('-').map(Number);
    const cursor = new Date(firstYear, firstMonth - 1, 1), end = new Date(currentYear, currentMonthNumber - 1, 1);
    if (cursor > end) return [current];
    const months = [];
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }
  function renderMonthly() {
    const months = monthKeysFromStart();
    $('monthly-list').innerHTML = months.map(key => {
      const totals = monthTaxSummary(key);
      return `<article class="monthly-card"><div class="eyebrow">${esc(monthLabel(key).toUpperCase())}</div><div class="monthly-net-label">NET EARNED (EUR)</div><strong class="monthly-net">${money(totals.net, 'EUR')}</strong><div class="monthly-detail"><span>Taxes</span><strong>${money(totals.taxTotal, 'EUR')}</strong><span>Gross earned</span><strong>${money(totals.gross, 'EUR')}</strong></div></article>`;
    }).join('');
  }
  function renderOverview() {
    renderMetrics();
    const key = weekKey(selectedWeek), totals = weekTotals(key), tasks = weekTasks(key).sort((a, b) => b.date.localeCompare(a.date));
    const currentKey = weekKey(new Date());
    $('week-title').textContent = key === currentKey ? 'This week' : key > currentKey ? 'Upcoming week' : 'Past week';
    $('week-range').textContent = weekRange(asDate(key));
    $('week-total').textContent = money(totals.total);
    $('weekly-paid').value = actualPaid(key).toFixed(2);
    $('weekly-paid').dataset.week = key;
    $('weekly-bonus').value = weeklyBonus(key).toFixed(2);
    $('weekly-bonus').dataset.week = key;
    $('weekly-tax-free').dataset.week = key;
    $('weekly-tax-free').checked = isTaxFree(key);
    const projectRows = totals.byProject.map(row => `<tr><td>${esc(row.name)}</td><td>${money(row.hourly)}</td><td>${money(row.bonus)}</td><td>${money(row.others)}</td><td class="right">${money(row.total)}</td></tr>`).join('');
    $('weekly-project-totals').innerHTML = `${projectRows || '<tr><td class="empty-cell" colspan="5">No tasks this week yet.</td></tr>'}<tr class="weekly-bonus-row"><td colspan="4">Weekly bonus (USD)</td><td class="right">${money(totals.bonus)}</td></tr><tr class="weekly-grand-row"><td colspan="4">Projected total (USD)</td><td class="right">${money(totals.total)}</td></tr><tr class="weekly-earned-row"><td colspan="4">Actual amount earned (EUR)</td><td class="right">${money(actualPaid(key), 'EUR')}</td></tr>`;
    $('weekly-task-list').innerHTML = tasks.length ? taskTable(tasks) : emptyTasks('No tasks this week yet. Add one to start tracking your earnings.');
  }
  function taskTable(tasks) {
    const includesWorkedHours = tasks.some(task => projectById(task.projectId)?.tracksWorkedHours);
    return `<div class="table-wrap"><table class="task-table"><thead><tr><th>TASK</th><th>PROJECT</th><th>SUBMITTED</th><th class="numeric">HOURS BILLED</th>${includesWorkedHours ? '<th class="numeric">HOURS WORKED</th>' : ''}<th class="numeric">HOURLY (USD)</th><th class="numeric">BONUS (USD)</th><th class="numeric">OTHERS (USD)</th><th class="numeric">PROJECTED (USD)</th><th></th></tr></thead><tbody>${tasks.map(task => {
      const amount = taskAmounts(task), project = projectById(task.projectId);
      const workedHoursCell = includesWorkedHours ? `<td class="numeric">${project?.tracksWorkedHours && task.hoursWorked != null ? n(task.hoursWorked).toFixed(2) : '—'}</td>` : '';
      return `<tr><td class="task-name">${esc(task.name)}</td><td>${esc(project?.name || 'Unassigned')}</td><td>${shortDate(task.date)}</td><td class="numeric">${task.hours.toFixed(2)}</td>${workedHoursCell}<td class="numeric">${money(amount.hourly)}</td><td class="numeric">${money(amount.bonus)}</td><td class="numeric">${money(amount.others)}</td><td class="numeric total-cell">${money(amount.total)}</td><td><button class="row-menu" data-edit="${esc(task.id)}" title="Edit task">···</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function emptyTasks(message) { return `<div class="empty-state"><strong>${esc(message)}</strong></div>`; }
  function renderAllWeeks() {
    const keys = [...new Set(state.tasks.map(task => weekKey(asDate(task.date))).concat(Object.keys(state.weeklyBonuses), Object.keys(state.weeklyActualPaid), Object.keys(state.taxFreeWeeks)))].sort((a, b) => b.localeCompare(a));
    $('all-week-groups').innerHTML = keys.length ? keys.map(key => {
      const start = asDate(key), tasks = weekTasks(key).sort((a, b) => b.date.localeCompare(a.date)), totals = weekTotals(key);
      return `<section class="panel week-group"><div class="group-heading"><div><h2>${weekRange(start)}</h2><p>${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${totals.hoursWorked.toFixed(2)} logged hours${totals.hoursBilled !== totals.hoursWorked ? ` · ${totals.hoursBilled.toFixed(2)} billed` : ''}</p></div><label class="weekly-paid-field featured-paid-field">Actual amount earned (EUR)<input class="weekly-paid-input" data-week-paid="${key}" type="number" min="0" step="0.01" value="${actualPaid(key).toFixed(2)}"></label><label class="weekly-bonus-field">Weekly bonus (USD)<input class="weekly-bonus-input" data-week-bonus="${key}" type="number" min="0" step="0.01" value="${weeklyBonus(key).toFixed(2)}"></label><label class="tax-free-toggle"><input type="checkbox" data-tax-free="${key}" ${isTaxFree(key) ? 'checked' : ''}>Tax-free week</label><div class="week-projection compact-projection"><small>PROJECTED (USD)</small><strong class="group-total">${money(totals.total)}</strong></div></div>${tasks.length ? taskTable(tasks) : emptyTasks('No tasks recorded for this week.')}</section>`;
    }).join('') : `<section class="panel">${emptyTasks('No tasks yet. Add a task to build your weekly log.')}</section>`;
  }
  function renderProjects() {
    $('week-start').value = String(state.settings.weekStart);
    $('project-list').innerHTML = state.projects.length ? state.projects.map(project => `<article class="project-row"><div><strong>${esc(project.name)}</strong><small>${state.tasks.filter(task => task.projectId === project.id).length} tasks</small></div><label>Hourly rate (USD)<input type="number" min="0" step="0.01" value="${n(project.hourlyRate).toFixed(2)}" data-project-rate="${esc(project.id)}"></label><label class="project-tracking-toggle"><input type="checkbox" data-project-worked="${esc(project.id)}" ${project.tracksWorkedHours ? 'checked' : ''}>Track worked hours separately</label><button class="remove-project" data-remove-project="${esc(project.id)}" ${state.tasks.some(task => task.projectId === project.id) ? 'disabled title="Project has tasks"' : ''}>Remove</button></article>`).join('') : emptyTasks('Add your first project above.') ;
  }
  function renderTaxes() {
    $('tax-list').innerHTML = state.taxes.length ? state.taxes.map(tax => `<article class="tax-row"><label>Tax name<input maxlength="60" value="${esc(tax.name)}" data-tax-name="${esc(tax.id)}"></label><label>Percentage (%)<input type="number" min="0" max="100" step="0.01" value="${n(tax.percentage)}" data-tax-rate="${esc(tax.id)}"></label><label>Monthly roof (EUR)<input type="number" min="0" step="0.01" placeholder="No roof" value="${tax.monthlyRoof == null ? '' : n(tax.monthlyRoof).toFixed(2)}" data-tax-roof="${esc(tax.id)}"></label><button class="remove-tax" data-remove-tax="${esc(tax.id)}" aria-label="Remove ${esc(tax.name)}">Remove</button></article>`).join('') : emptyTasks('No taxes configured. Add one above.');
  }
  function renderProjectOptions(selected = '') {
    $('task-project').innerHTML = '<option value="">Choose a project</option>' + state.projects.map(project => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('');
    $('task-project').value = selected;
  }
  function openTask(task = null) {
    $('task-form').reset(); $('edit-id').value = task?.id || ''; $('modal-title').textContent = task ? 'Edit task' : 'Add a task';
    renderProjectOptions(task?.projectId || '');
    updateTaskRate();
    $('task-name').value = task?.name || ''; $('task-hours').value = task ? task.hours.toFixed(2) : '';
    $('task-hours-worked').value = task?.hoursWorked == null ? '' : n(task.hoursWorked).toFixed(2);
    $('task-date').value = task?.date || today(); $('task-bonus').value = task ? task.bonusAmount.toFixed(2) : '0.00'; $('task-others').value = task ? task.othersAmount.toFixed(2) : '0.00';
    $('delete-task').classList.toggle('hidden', !task); $('delete-task').dataset.id = task?.id || '';
    updateWorkedHoursField(); updateEstimate(); $('task-modal').classList.remove('hidden'); $('task-name').focus();
  }
  function closeTask() { $('task-modal').classList.add('hidden'); }
  function taskFromForm() {
    const project = projectById($('task-project').value), existing = state.tasks.find(task => task.id === $('edit-id').value);
    return {
      id: $('edit-id').value || crypto.randomUUID(),
      projectId: $('task-project').value,
      name: $('task-name').value.trim(),
      hours: Math.max(0, n($('task-hours').value)),
      hourlyRate: $('task-rate').valueAsNumber,
      hoursWorked: project?.tracksWorkedHours ? Math.max(0, n($('task-hours-worked').value)) : existing?.hoursWorked ?? null,
      date: $('task-date').value,
      bonusAmount: Math.max(0, n($('task-bonus').value)),
      othersAmount: Math.max(0, n($('task-others').value))
    };
  }
  function updateTaskRate() {
    const project = projectById($('task-project').value);
    const existing = state.tasks.find(task => task.id === $('edit-id').value);
    const hourlyRate = project && existing?.projectId === project.id ? existing.hourlyRate : project?.hourlyRate;
    $('task-rate').value = hourlyRate ?? '';
  }
  function updateWorkedHoursField() {
    const enabled = Boolean(projectById($('task-project').value)?.tracksWorkedHours);
    $('worked-hours-field').classList.toggle('hidden', !enabled);
    $('task-hours-worked').required = enabled;
  }
  function updateEstimate() {
    const hours = Math.max(0, n($('task-hours').value));
    const hourlyRate = Math.max(0, n($('task-rate').value));
    const { total, bonus, others } = taskAmounts({ hours, hourlyRate, bonusAmount: $('task-bonus').value, othersAmount: $('task-others').value });
    $('task-estimate').textContent = money(total);
    $('estimate-detail').textContent = $('task-project').value
      ? `${hours.toFixed(2)} billed h × ${money(hourlyRate)}/h + ${money(bonus)} bonus + ${money(others)} others`
      : 'Choose a project to fill in the hourly rate.';
  }
  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2300);
  }
  function saveWeeklyBonus(key, value) {
    state.weeklyBonuses[key] = Math.max(0, n(value));
    if (!state.weeklyBonuses[key]) delete state.weeklyBonuses[key];
    save(); renderOverview(); renderAllWeeks();
  }
  function saveTaxFreeWeek(key, checked) {
    if (checked) state.taxFreeWeeks[key] = true;
    else delete state.taxFreeWeeks[key];
    save(); renderOverview(); renderAllWeeks(); renderMetrics();
  }
  function saveActualPaid(key, value) {
    state.weeklyActualPaid[key] = Math.max(0, n(value));
    if (!state.weeklyActualPaid[key]) delete state.weeklyActualPaid[key];
    save(); renderMetrics(); renderOverview(); renderAllWeeks();
  }
  function updateActualPaidWhileEditing(key, value) {
    if (!key) return;
    state.weeklyActualPaid[key] = Math.max(0, n(value));
    if (!state.weeklyActualPaid[key]) delete state.weeklyActualPaid[key];
    save(); renderMetrics();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, ...state }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `earnla-backup-${today()}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  async function importData(file) {
    try {
      const imported = JSON.parse(await file.text());
      let next;
      if (Array.isArray(imported.projects) && Array.isArray(imported.tasks)) next = normalize(imported);
      else if (imported.settings && Array.isArray(imported.settings.projects) && Array.isArray(imported.tasks)) {
      const projects = imported.settings.projects.map(project => ({ id: String(project.id || crypto.randomUUID()), name: String(project.name || ''), hourlyRate: n(project.hourlyRate), tracksWorkedHours: Boolean(project.tracksWorkedHours) }));
        const tasks = imported.tasks.map(task => {
          const project = projects.find(item => item.name.toLowerCase() === String(task.project || '').toLowerCase());
          const legacyProject = imported.settings.projects.find(item => item.name.toLowerCase() === String(task.project || '').toLowerCase());
          return { id: String(task.id || crypto.randomUUID()), projectId: project?.id || '', name: String(task.name || 'Task'), hours: n(task.hours), hourlyRate: task.hourlyRate, hoursWorked: task.hoursWorked == null ? null : n(task.hoursWorked), date: localDate(task.submittedAt || task.date || new Date()), bonusAmount: n(task.bonusAmount ?? task.bonus), othersAmount: n(task.othersAmount ?? task.others ?? (task.status === 'rejected' ? legacyProject?.rejectedFlat : legacyProject?.acceptedFlat)) };
        });
        next = normalize({ settings: { currency: 'USD', weekStart: imported.settings.weekStart ?? 1, taxesInitialized: imported.settings.taxesInitialized ?? Array.isArray(imported.taxes) }, projects, tasks, weeklyBonuses: imported.weeklyBonuses || {}, weeklyActualPaid: imported.weeklyActualPaid || {}, taxes: imported.taxes || [], taxFreeWeeks: imported.taxFreeWeeks || {} });
      } else throw new Error('This JSON does not contain Earnla data.');
      if (next.tasks.some(task => !projectByIdFrom(next.projects, task.projectId))) throw new Error('Some tasks refer to a project that is missing from this file.');
      if (!confirm(`Import ${next.projects.length} projects and ${next.tasks.length} tasks? This replaces the current Earnla data.`)) return;
      state = next;
      const saved = await save();
      renderOverview(); renderAllWeeks(); renderProjects(); renderTaxes();
      toast(saved ? 'JSON data imported into SQLite' : 'Import kept in this browser; SQLite could not be reached.');
    } catch (error) {
      toast(error.message || 'Could not import that JSON file.');
    }
  }
  function projectByIdFrom(projects, id) { return projects.find(project => project.id === id) || null; }

  async function initialize() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load SQLite data.');
      const result = await response.json();
      backendReady = true;
      if (result.state) {
        state = normalize(result.state);
        if (!state.settings.taxesInitialized) {
          if (!state.taxes.length) state.taxes = structuredClone(initialTaxes);
          state.settings.taxesInitialized = true;
        }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        const projectTrackingNeedsSave = result.state.projects?.some((project, index) => Boolean(project.tracksWorkedHours) !== Boolean(state.projects[index]?.tracksWorkedHours));
        if (result.state.settings?.currency !== 'USD' || !result.state.settings?.taxesInitialized || projectTrackingNeedsSave) await save();
      } else {
        state = load();
        if (!state.settings.taxesInitialized) {
          if (!state.taxes.length) state.taxes = structuredClone(initialTaxes);
          state.settings.taxesInitialized = true;
        }
        const saved = await save();
        if (saved) toast('Browser data saved to SQLite');
      }
    } catch {
      backendReady = false;
      state = load();
      toast('SQLite is unavailable. Changes are saved in this browser only.');
    }
    renderOverview(); renderAllWeeks(); renderProjects(); renderTaxes(); renderMonthly();
  }

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('add-task').onclick = $('add-task-list').onclick = () => { if (!state.projects.length) { setView('projects'); toast('Add a project first.'); return; } openTask(); };
  $('close-modal').onclick = $('cancel-modal').onclick = closeTask;
  $('task-modal').addEventListener('click', event => { if (event.target === $('task-modal')) closeTask(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTask(); });
  ['task-hours', 'task-rate', 'task-bonus', 'task-others'].forEach(id => $(id).addEventListener('input', updateEstimate));
  $('task-project').addEventListener('change', () => { updateTaskRate(); updateWorkedHoursField(); updateEstimate(); });
  $('task-form').addEventListener('submit', event => {
    event.preventDefault(); const task = taskFromForm();
    if (!task.projectId || !task.name || !task.date || !Number.isFinite(task.hourlyRate) || task.hourlyRate < 0) return;
    task.hours = Math.round(task.hours * 100) / 100;
    if (task.hoursWorked != null) task.hoursWorked = Math.round(task.hoursWorked * 100) / 100;
    const index = state.tasks.findIndex(item => item.id === task.id);
    if (index >= 0) state.tasks[index] = task; else state.tasks.push(task);
    save(); closeTask(); renderOverview(); renderAllWeeks(); renderProjects(); toast(index >= 0 ? 'Task updated' : 'Task added');
  });
  $('delete-task').onclick = () => {
    const id = $('delete-task').dataset.id; state.tasks = state.tasks.filter(task => task.id !== id); save(); closeTask(); renderOverview(); renderAllWeeks(); renderProjects(); toast('Task deleted');
  };
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) { const task = state.tasks.find(item => item.id === edit.dataset.edit); if (task) openTask(task); }
    const remove = event.target.closest('[data-remove-project]');
    if (remove && !remove.disabled) { state.projects = state.projects.filter(project => project.id !== remove.dataset.removeProject); save(); renderProjects(); renderOverview(); }
  });
  $('weekly-bonus').addEventListener('change', event => saveWeeklyBonus(event.target.dataset.week, event.target.value));
  $('weekly-tax-free').addEventListener('change', event => saveTaxFreeWeek(event.target.dataset.week, event.target.checked));
  $('weekly-paid').addEventListener('input', event => updateActualPaidWhileEditing(event.target.dataset.week, event.target.value));
  $('weekly-paid').addEventListener('change', event => saveActualPaid(event.target.dataset.week, event.target.value));
  $('all-week-groups').addEventListener('input', event => {
    const paid = event.target.closest('[data-week-paid]');
    if (paid) updateActualPaidWhileEditing(paid.dataset.weekPaid, paid.value);
  });
  $('all-week-groups').addEventListener('change', event => {
    const paid = event.target.closest('[data-week-paid]');
    if (paid) return saveActualPaid(paid.dataset.weekPaid, paid.value);
    const bonus = event.target.closest('[data-week-bonus]');
    if (bonus) saveWeeklyBonus(bonus.dataset.weekBonus, bonus.value);
    const taxFree = event.target.closest('[data-tax-free]');
    if (taxFree) saveTaxFreeWeek(taxFree.dataset.taxFree, taxFree.checked);
  });
  $('prev-week').onclick = () => { selectedWeek = addDays(selectedWeek, -7); renderOverview(); };
  $('next-week').onclick = () => { selectedWeek = addDays(selectedWeek, 7); renderOverview(); };
  $('this-week').onclick = () => { selectedWeek = weekStart(new Date()); renderOverview(); };
  $('view-all').onclick = () => setView('tasks');
  $('project-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('project-name').value.trim();
    if (!name) return;
    if (state.projects.some(project => project.name.toLowerCase() === name.toLowerCase())) { toast('That project already exists.'); return; }
    state.projects.push({ id: crypto.randomUUID(), name, hourlyRate: Math.max(0, n($('project-rate').value)), tracksWorkedHours: $('project-track-worked').checked });
    $('project-form').reset(); save(); renderProjects(); renderOverview(); toast('Project added');
  });
  $('project-list').addEventListener('change', event => {
    const workedHoursToggle = event.target.closest('[data-project-worked]');
    if (workedHoursToggle) {
      const project = projectById(workedHoursToggle.dataset.projectWorked); if (!project) return;
      project.tracksWorkedHours = workedHoursToggle.checked; save(); renderProjects(); renderOverview(); renderAllWeeks(); return;
    }
    const input = event.target.closest('[data-project-rate]'); if (!input) return;
    const project = projectById(input.dataset.projectRate); if (!project) return;
    project.hourlyRate = Math.max(0, n(input.value)); save(); renderProjects(); renderOverview(); renderAllWeeks();
  });
  $('week-start').addEventListener('change', event => { state.settings.weekStart = Number(event.target.value); save(); renderMetrics(); renderOverview(); renderAllWeeks(); });
  $('export-btn').onclick = exportData;
  $('weekly-tax-free').dataset.week = weekKey(selectedWeek);
  $('tax-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('tax-name').value.trim(), percentage = Number($('tax-percentage').value), roofText = $('tax-roof').value;
    const monthlyRoof = roofText === '' ? null : Number(roofText);
    if (!name || !Number.isFinite(percentage) || percentage < 0 || percentage > 100 || (monthlyRoof != null && (!Number.isFinite(monthlyRoof) || monthlyRoof < 0))) return;
    state.taxes.push({ id: crypto.randomUUID(), name, percentage, monthlyRoof });
    $('tax-form').reset(); save(); renderTaxes(); renderMetrics(); toast('Tax added');
  });
  $('tax-list').addEventListener('change', event => {
    const input = event.target, tax = state.taxes.find(item => item.id === (input.dataset.taxName || input.dataset.taxRate || input.dataset.taxRoof));
    if (!tax) return;
    if (input.dataset.taxName) tax.name = input.value.trim() || tax.name;
    if (input.dataset.taxRate) tax.percentage = Math.max(0, Math.min(100, n(input.value)));
    if (input.dataset.taxRoof) tax.monthlyRoof = input.value === '' ? null : Math.max(0, n(input.value));
    save(); renderTaxes(); renderMetrics();
  });
  $('tax-list').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-tax]');
    if (!remove) return;
    state.taxes = state.taxes.filter(tax => tax.id !== remove.dataset.removeTax);
    save(); renderTaxes(); renderMetrics(); toast('Tax removed');
  });
  $('import-btn').onclick = () => $('import-file').click();
  $('import-file').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importData(file);
    event.target.value = '';
  });

  initialize();
})();
