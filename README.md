# Earnla

A local earnings tracker built with Next.js, React, TypeScript and SQLite. No account or external service is required.

## Run locally

Use Node.js 22.13 or newer (built-in `node:sqlite` is required).

```sh
npm install
npm run db:migrate
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

For a production build:

```sh
npm run build
npm start
```

## Database and privacy

- `npm run db:migrate` applies the numbered SQL files in `migrations/`. It creates the schema and migration history only: no projects, tasks, payments, bonuses, or tax presets are seeded. Running it again is safe.
- The database defaults to `data/earnla.sqlite`. Missing migrations also run automatically when the API first opens the database.
- To choose another location, set `EARNLA_DB_PATH` in the shell or in an untracked `.env.local`. The migration command reads `.env.local` too. Keep the file outside `public/`.
- Database files, SQLite journals, environment files, backups, dependencies and build output are ignored by Git. The source contains no personal earnings records or project-specific defaults.
- SQLite is the authoritative store. The app does not cache earnings in browser storage or automatically import old browser data. Obsolete browser copies are removed after a successful database load.
- **Export** downloads a JSON backup. **Import** restores a selected JSON backup after confirmation and replaces the current database records. Exports from the previous app remain supported, including saved task rates.
- Backups contain the data you entered; keep them private. Start from a fresh database to share a clean installation.
- This is a local, single-user app. The supplied start commands bind to `127.0.0.1`.

## Earnings rules

- Each project sets a default hourly rate in USD. Each task saves its own rate, so changing a project rate affects new tasks while submitted tasks retain their saved rates.
- A projected task total is `billed hours × saved hourly rate + task bonus + others`. Each week adds its separate weekly bonus. All-time projected includes every task and weekly bonus.
- Billed and worked hours use two decimal places. Projects can enable separate worked-hour tracking.
- Tasks are grouped by submission week; the start day is configurable.
- Actual weekly payments are entered in EUR. All-time earned sums those payments, separately from USD projections.
- Monthly earnings use the payroll Friday following the period end, including when payment falls in the next month.
- Taxes apply independently to taxable gross EUR earnings. Each tax has a name, percentage and optional monthly earnings roof. Tax-free weeks contribute to gross and net earnings but are excluded from the taxable base.
- The monthly screen starts at the first recorded working month and shows gross, taxes and net earned.

## Project structure

- `app/`: Next.js page, shared styling and `/api/state` route.
- `components/`: dashboard, task form, tables and project/tax settings.
- `lib/`: shared types, validation, calculations, SQLite access and migration runner.
- `migrations/`: schema-only SQL migrations.
- `tests/`: synthetic fixtures covering calculations, imports, rate history and database persistence.

```sh
npm run typecheck
npm test
```
