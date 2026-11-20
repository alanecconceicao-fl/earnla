# Earnla — local earnings tracker

Use Node.js with built-in `node:sqlite` support.

```sh
git clone https://github.com/alanecconceicao-fl/earnla.git
cd earnla
node server.mjs
```

Run `node server.mjs` from this folder and open `http://127.0.0.1:4173`. The server uses Node's built-in `node:sqlite` module and stores projects, tasks, settings, weekly bonuses, and actual weekly payments in `earnings.sqlite` beside the server file. On the first run after this update, existing browser data is copied into SQLite. After that, the SQLite database is the app's primary store.

Use **Export** to download a JSON backup. Use **Import** to restore an Earnla JSON export; importing replaces the current SQLite data after confirmation. The SQLite database and its journal files are ignored by Git.

## Earnings calculation

- Each project sets a default hourly rate in USD for new tasks. Each task saves the rate it uses. To correct a specific task, edit its hourly rate in the task form.
- The projected hourly amount is `hours billed × saved task hourly rate`. Bonus and others are added in USD.
- On upgrade, existing tasks are assigned the project rates saved at the time of migration. Backups with saved task rates preserve them. Older backups use their own project rates.
- Projects with separate worked-hour tracking enabled require a second worked-hours value per task. Worked hours are stored and displayed to two decimal places. The existing Code Behaviors project is enabled by default.
- Tasks are grouped into weeks by their submission date. The week start day is configurable.
- Each week has a separate weekly bonus. The weekly total is the sum of its task totals plus that weekly bonus.
- Each week also has an actual-paid amount field for entering the amount received in EUR. All-time earned is the sum of those euro amounts.
- All-time projected is task totals plus weekly bonuses in USD; it remains separate from actual earned amounts in EUR.
- Monthly net is actual weekly EUR earnings minus configured taxes. Weekly earnings are assigned to the month of their payroll date: the Friday after the period-ending Sunday. Each tax applies independently to taxable gross for the month, up to its optional monthly roof; tax-free weeks are excluded from taxable gross.
- The initial tax rules are IRS at 25% without a roof and SS at 21.4% with a €6,445.56 monthly roof. Tax rules can be edited, added, or removed.
- JSON backups include weekly actual-paid amounts as well as weekly bonuses.

Existing v1 tasks and project rates are migrated in this browser. Existing project completion/rejection amounts are carried to each task as its `others` amount.
