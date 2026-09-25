# CLAUDE.md

Guidance for working in this repository.

## What this is

**Property management software with accountability built in** — a paid SaaS
for owners and the property managers who run their units: tenants, leases, a
rent ledger, vacancies and inspections. Accountability is a **two-way
scorecard**: managers are measured on vacancy days, inspections and rent
collection; owners are measured on how fast they answer owner requests
(spending approvals, decisions, reimbursements). See `README.md` for the full
feature set.

Storage units are a separate product. Don't build anything storage-related
here.

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
  `src/lib/supabase/admin.ts`, used by the daily cron (which must read and
  write across tenants), the team-invite action and the super-admin surface.
  The admin client opts every request out of Next's fetch cache; keep it that
  way, or the cron acts on stale data.
- **Roles**: platform super admin (`profiles.is_super_admin`, set only via
  service role — see `supabase/super-admin.sql`; `PLATFORM_ADMIN_EMAILS` is a
  fallback) → org `owner` → org `manager`. Super admins get `/admin`: every
  org, read-only "view as", and user/role management across orgs
  (`src/app/actions/admin-users.ts`). Shared add-member logic is in
  `src/lib/membership.ts`.
- **Role enforcement** is in both places: RLS (members read/write, owners
  delete and answer owner requests) and each server action (`ctx.role`,
  `ctx.isAdminView`). Every mutation starts with the `isAdminView` read-only
  guard.
- **All the math is pure** and lives in `src/lib/calculations.ts` (vacancies,
  rent ledger, rent collection, owner response times). Add a test in
  `calculations.test.ts` for any change there. Dates are compared as calendar
  days ('YYYY-MM-DD' strings) to avoid timezone drift. Money is
  `numeric(12,2)` in Postgres and integer cents in the math.
- **Rent ledger** (`supabase/leasing.sql`): balance is always computed from
  `ledger_entries`, never stored. Entries are append-only (no update/delete
  policy); corrections are offsetting entries. Amounts are positive and the
  `type` sets the sign (`ledgerSign`). Deposits don't touch the rent balance.
- **Automatic postings** happen in the daily cron (`api/cron/reminders`):
  upcoming leases activate on their start date, rent posts on the due day from
  `billing_start_date`, late fees post the day after the grace period. Each
  automatic entry has an `auto_key` (`rent:YYYY-MM`, `late:YYYY-MM`) that is
  unique per lease, so re-runs never double-post.
- **One active lease per unit** is a partial unique index. Leases past their
  `end_date` keep billing (holdover) until someone ends them.
- **Owner requests** are tamper-resistant by trigger: the DB stamps
  `created_at` / `responded_at`, the content is frozen once sent, answered or
  withdrawn requests are final, and there's no delete. Only the requester can
  withdraw.
- **Online rent collection** (`supabase/payments.sql`, Stripe Connect): rent
  goes to each org's own Stripe account; every tenant-money call passes
  `{ stripeAccount }`. Tenants pay from a pay link (`/pay/[token]`, no login)
  on Stripe's hosted Checkout, so the app never sees card or bank numbers; it
  stores only Stripe IDs and a label like "Visa •••• 4242". All Stripe → app
  state goes through `src/lib/online-payments.ts`, which is idempotent and
  called from the webhook (`api/stripe/webhook`), the pay page's return, and
  the cron. Online payments post to the same ledger as `payment` entries with
  `auto_key = stripe:<payment_intent>`. Autopay is turned on only by the
  tenant (a trigger stops members turning it on); the cron charges on the
  due date and retries a failed charge every 3 days, 3 tries max
  (`autopayChargeDue`). Rent reminders (`rentReminderDue`) go out 3 days
  before the due date and the day after a missed payment, deduped in
  `rent_reminders`. Without `STRIPE_SECRET_KEY` it all stays hidden.
- **Work orders** (`supabase/work-orders.sql`): exactly four statuses, forward
  only, one step at a time (New → Assigned → In progress → Done), enforced and
  timestamped by trigger. Vendor is a name + phone label, no vendor accounts.
  Photos reuse the Inspections pattern: private `property-media` bucket,
  `{org_id}/work-orders/…`, shown with `MediaGallery`. Tenants report repairs
  at `/request/[token]` (per-unit token, no login); their photos upload
  through one-time signed upload URLs into the same bucket.
- **Public pages** (`/pay`, `/request`, `/api/stripe`) are listed in
  `PUBLIC_PATHS` in `src/lib/supabase/middleware.ts`, read with the service
  role, and trust only the unguessable token in the URL. Anything a tenant
  types is escaped before it goes into an email (`toHtml` in `email.ts`).
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
- New SQL goes in its own additive, re-runnable file under `supabase/`, with
  RLS on every new table using `is_org_member` / `is_org_owner`.
