# Property Manager Accountability Platform

Track every vacancy from move-out to move-in, document every promise a property
manager makes, measure every delay, and calculate every dollar lost to vacancy.

This is **not** property management software. It's an accountability layer that
creates transparency and measurable performance around vacancies — for property
owners who want to hold their managers accountable.

## What it does (Version 1)

- **Create vacancy** — log the move-out and the committed make-ready / listing /
  lease-signing / move-in dates. The vacancy timer starts immediately.
- **Move-out inspection** — upload a walkthrough video, photos, damage notes,
  and an estimated turn cost.
- **Vacancy tracking** — days vacant, days to next deadline, traffic-light
  status (🟢 on track / 🟡 approaching / 🔴 missed), and live vacancy cost.
- **Automated follow-up** — escalating email reminders at 1 day before, the day
  of, and 3 / 7 / 14 days overdue.
- **Delay explanations** — when a deadline slips, the manager records why
  (contractor, materials, owner approval, leasing, market, tenant, other).
- **Ready-for-market verification** — final walkthrough video, photos, notes.
- **Leased-unit tracking** — record actual dates; the app computes turn time,
  days vacant, vacancy cost, and whether deadlines were met.
- **Cost tracker** — daily rent loss and totals by unit, property, and manager.
- **Property manager scorecard** — avg turn time, avg days vacant, on-time %,
  deadlines missed, active vacancies, avg leasing time, vacancy cost created.
- **Owner & property dashboards** — portfolio overview and per-property rollups.

## Tech stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Postgres (with Row Level Security), Auth, and Storage
- **Resend** — transactional reminder emails
- **Vercel** — hosting + Cron (daily reminder job)

## Getting started

### 1. Create a Supabase project

In the [Supabase dashboard](https://supabase.com/dashboard), create a project,
then open the **SQL editor** and run [`supabase/schema.sql`](supabase/schema.sql).
This creates all tables, enums, RLS policies, triggers, and the private
`vacancy-media` storage bucket.

Then run [`supabase/routine-inspections.sql`](supabase/routine-inspections.sql)
to add the routine property-inspection pillar (schedules, inspections, the
`property-media` bucket), then
[`supabase/inspection-templates.sql`](supabase/inspection-templates.sql) for
customizable, reusable checklist templates, then
[`supabase/property-structure.sql`](supabase/property-structure.sql) for
buildings & units and inspection targeting. All are additive and idempotent.

> By default Supabase requires email confirmation. For the smoothest local dev
> you can disable it under **Authentication → Providers → Email**.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values from **Supabase → Project Settings → API** and, if you want
live emails, a [Resend](https://resend.com) API key. See `.env.example` for the
full list (the service-role key and `CRON_SECRET` are server-only).

### 3. Install & run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # run the calculation unit tests
npm run typecheck  # TypeScript check
```

Sign up, create your organization (portfolio), add a property, then log a
vacancy.

### 4. (Optional) Seed demo data

After signing up once, copy your user id from `select id from auth.users;`,
paste it into [`supabase/seed.sql`](supabase/seed.sql), and run it.

## Deploying to Vercel

1. Push this repo and import it into Vercel.
2. Add the same environment variables (Project → Settings → Environment
   Variables). Set `NEXT_PUBLIC_SITE_URL` to your deployed URL.
3. `vercel.json` registers a daily cron at 13:00 UTC that calls
   `/api/cron/reminders`. Vercel automatically authenticates cron requests with
   the `CRON_SECRET` you configure, so set that variable too.

## Project structure

```
src/
  app/
    (app)/              Authenticated dashboard (sidebar layout)
      dashboard/        Owner portfolio overview
      vacancies/        List, create, and per-vacancy lifecycle
      properties/       Portfolio + per-property dashboard
      scorecard/        Property manager scorecard
      team/             Invite / manage owners & managers
    actions/            Server actions (create vacancy, milestones, etc.)
    api/cron/reminders/ Daily reminder job
    login, signup, onboarding, auth/callback
  components/           UI + forms (client components)
  lib/
    calculations.ts     Core accountability math (pure, unit-tested)
    queries.ts          Server-side data access
    supabase/           Browser / server / admin / middleware clients
    reminders.ts        Reminder message templates
    email.ts            Resend wrapper
supabase/
  schema.sql            Full schema + RLS + storage bucket
  seed.sql              Optional demo data
```

## The accountability math

All the metrics live in [`src/lib/calculations.ts`](src/lib/calculations.ts) as
pure functions and are covered by
[`src/lib/calculations.test.ts`](src/lib/calculations.test.ts):

- **Daily rent loss** = monthly rent × 12 ÷ 365
- **Days vacant** = move-out → move-in (or today)
- **Vacancy cost** = daily rent loss × days vacant
- **Status** = 🟢/🟡/🔴 from the next open committed deadline
- **Scorecard** = per-manager rollup of turn time, on-time %, cost, and more
