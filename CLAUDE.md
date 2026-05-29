# CLAUDE.md

Guidance for working in this repository.

## What this is

A **Property Manager Accountability Platform** — a paid SaaS that lets property
owners hold property managers accountable for turning and leasing vacant units
quickly. It is deliberately **not** property management software; it's an
accountability/transparency layer. See `README.md` for the full feature set.

## Stack

- Next.js 14 App Router + TypeScript + Tailwind
- Supabase: Postgres (RLS), Auth, Storage
- Resend for email, Vercel Cron for the daily reminder job

## Commands

```bash
npm run dev        # local dev server
npm test           # vitest unit tests (calculations)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # production build
```

## Architecture notes

- **Multi-tenancy** is enforced entirely by Postgres RLS (see
  `supabase/schema.sql`). The tenant boundary is the `organizations` row; every
  domain table carries `org_id`. RLS uses `SECURITY DEFINER` helpers
  (`is_org_member`, `is_org_owner`) to avoid recursive policy evaluation.
- **Never** put the service-role key in client code. It lives only in
  `src/lib/supabase/admin.ts`, used by the reminder cron (which must read across
  tenants) and the team-invite action.
- **All accountability math is pure** and lives in `src/lib/calculations.ts`.
  Add a test in `calculations.test.ts` for any change there. Dates are compared
  as calendar days to avoid timezone drift.
- **Server Components** fetch via `src/lib/queries.ts`; **mutations** go through
  Server Actions in `src/app/actions/*`. Interactive pieces (file upload, forms
  that show inline errors) are client components under `src/components/forms/`.
- **Media** is stored in the private `vacancy-media` bucket keyed as
  `{org_id}/{vacancy_id}/{filename}`; access is via short-lived signed URLs.
- **Vacancy lifecycle** stage is derived from recorded dates
  (`deriveStageFromDates`) and never downgraded below an inspection-driven
  stage (compare with `stageRank`).

## Conventions

- Keep currency/date/number formatting in `src/lib/utils.ts`.
- Prefer adding labels to the maps in `src/lib/types.ts` over inlining strings.
- When adding a deadline/reminder rule, update both `calculations.ts`
  (`dueReminder`) and the templates in `src/lib/reminders.ts`.
