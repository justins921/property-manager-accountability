# Property Management, with accountability built in

Property management software for owners and the managers who run their units:
tenants, leases, a rent ledger, vacancies and inspections. What makes it
different is a **two-way scorecard**. Managers are measured on vacancy days,
inspections and rent collection. Owners are measured on how fast they answer
the spending approvals, decisions and reimbursements their managers send them.
Both sides see whether the other is doing their part.

## What it does

**Leasing and rent**
- **Tenants**: contact details, current lease, past leases and ledger.
- **Leases**: a unit rented to one or more tenants, fixed-term or
  month-to-month, with rent, due day, deposit and a flat late fee after a
  grace period. One active lease per unit, enforced by the database.
- **Rent ledger**: charges, payments (cash, check, Zelle, ACH, money order),
  credits, late fees and deposits. Rent and late fees post automatically each
  day; managers record payments and credits by hand, and every manual entry
  records who made it. Balances are always calculated from the entries.
- **Rent roll**: every unit with its tenant, rent, balance and lease end,
  filterable to leases ending in the next 60 days.

**Vacancies (turn accountability)**
- **Create vacancy**: log the move-out and the committed make-ready / listing
  / lease-signing / move-in dates. The vacancy timer starts immediately. When
  a lease ends, the app offers to open the vacancy for you.
- **Move-out inspection** and **ready-for-market verification** with video,
  photos, notes and estimated turn cost.
- **Vacancy tracking**: days vacant, days to next deadline, 🟢/🟡/🔴 status and
  live vacancy cost, plus escalating email reminders (1 day before, day of,
  and 3 / 7 / 14 days overdue) and required delay explanations.
- When a vacancy's lease is signed, the app offers to create the new lease.

**Online rent collection** (Stripe)
- Each portfolio connects its own Stripe account, so rent goes straight to
  the owner's bank.
- **Pay by link:** the manager sends the tenant a secure link for the amount
  due. The tenant pays by bank account or card on Stripe's page. No tenant
  login, and no card or bank numbers are stored in the app.
- **Autopay:** the tenant can save their payment method on the pay page (or
  from an autopay link). It's charged on each due date; failed charges retry
  every 3 days (3 tries) and the lease is flagged on the rent roll.
- **Reminders:** 3 days before rent is due and the day after a missed
  payment, with a pay link.
- Every online payment lands in the same ledger as manual ones, so balances,
  the rent roll and the scorecards stay in sync with no manual entry.

**Maintenance work orders**
- Managers create work orders with photos; tenants send repair requests with
  photos from their unit's request link, no login needed.
- Four steps, one click each: New → Assigned → In progress → Done. Assigning
  records the vendor (name + phone); Done records the date and optional cost.
- Each property shows its work-order history: what was fixed, when, by whom,
  and what it cost.

**Routine inspections**: recurring, template-based condition checks by
property, building or unit, with required photos.

**Two-way scorecards**
- **Property managers**: rent collected by the due date, past-due balance,
  turn time, days vacant, on-time %, deadlines missed, vacancy cost created,
  and inspections on schedule.
- **Owners**: a manager sends an **owner request** (approve spending, make a
  decision, reimburse a cost) with an amount and due-by date. The owner
  approves or declines. The Owner Scorecard shows average response time and
  the share answered on time. The database stamps the timestamps, and
  requests can't be edited or deleted after they're sent.

**Roles**: platform super admin → owner → manager. Managers handle tenants,
leases, ledger entries, vacancies, inspections and owner requests. Owners can
also answer owner requests, delete leases and tenants, and manage the team.

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
buildings & units and inspection targeting, then
[`supabase/template-photos.sql`](supabase/template-photos.sql) for template
categories (interior/exterior) and per-item required photos, then
[`supabase/super-admin.sql`](supabase/super-admin.sql) for the platform super
admin flag, then [`supabase/leasing.sql`](supabase/leasing.sql) for tenants,
leases, the rent ledger and owner requests, then
[`supabase/payments.sql`](supabase/payments.sql) for online rent collection and
[`supabase/work-orders.sql`](supabase/work-orders.sql) for maintenance. All
are additive and idempotent.

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

Sign up, create your organization (portfolio), add a property and its units,
then create leases (or log a vacancy).

### 4. (Optional) Seed demo data

After signing up once, copy your user id from `select id from auth.users;`,
paste it into [`supabase/seed.sql`](supabase/seed.sql), and run it.

### 5. (Optional) Online rent collection

1. In Stripe, turn on **Connect** (Settings → Connect).
2. Add a **Connect** webhook endpoint ("Events on connected accounts") at
   `https://<your-site>/api/stripe/webhook` with: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.succeeded`,
   `payment_intent.processing`, `payment_intent.payment_failed`,
   `account.updated`.
3. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Start with test keys.
4. An owner clicks **Set up online payments** on the Rent Roll page.

Test mode: pay with card `4242 4242 4242 4242`, or `4000 0000 0000 0341`
(saves fine, then declines when autopay charges it).

## Deploying to Vercel

1. Push this repo and import it into Vercel.
2. Add the same environment variables (Project → Settings → Environment
   Variables). Set `NEXT_PUBLIC_SITE_URL` to your deployed URL.
3. `vercel.json` registers a daily cron at 13:00 UTC that calls
   `/api/cron/reminders`. It activates upcoming leases, posts rent and late
   fees, charges autopay, sends rent and vacancy reminders and generates
   routine inspections. Vercel
   automatically authenticates cron requests with
   the `CRON_SECRET` you configure, so set that variable too.

## Project structure

```
src/
  app/
    (app)/              Authenticated app (sidebar layout)
      dashboard/        Portfolio overview
      properties/       Portfolio + per-property dashboard
      units/[id]/       Unit occupancy, lease history, vacancies
      tenants/          Tenant list + detail (current/past leases, ledger)
      leases/           New lease + lease detail (ledger, payments, end lease)
      rent-roll/        Every unit with tenant, rent, balance, lease end
      vacancies/        List, create, and per-vacancy lifecycle
      inspections/      Routine inspections + templates
      requests/         Owner requests (send, approve/decline, history)
      work-orders/      Work orders (New → Assigned → In progress → Done)
      scorecard/        Two-way scorecards (managers, owners/)
      team/             Invite / manage owners & managers
      admin/            Platform super admin
    actions/            Server actions (tenants, leases, ledger, vacancies…)
    api/cron/reminders/ Daily job: rent, late fees, autopay, reminders, inspections
    api/stripe/webhook/ Stripe Connect webhook (payments, autopay)
    pay/[token]/        Public pay page (no tenant login)
    request/[token]/    Public repair request form (no tenant login)
    login, signup, onboarding, auth/callback
  components/           UI + forms (client components)
  lib/
    calculations.ts     All the math: vacancies, ledger, scorecards (pure, tested)
    queries.ts          Server-side data access
    supabase/           Browser / server / admin / middleware clients
    reminders.ts        Reminder message templates
    email.ts            Resend wrapper
supabase/
  schema.sql            Core schema + RLS + storage bucket
  leasing.sql           Tenants, leases, rent ledger, owner requests
  payments.sql          Online rent collection: pay links, autopay, reminders
  work-orders.sql       Maintenance work orders + photos
  seed.sql              Optional demo data
```

## The math

All the metrics live in [`src/lib/calculations.ts`](src/lib/calculations.ts) as
pure functions and are covered by
[`src/lib/calculations.test.ts`](src/lib/calculations.test.ts):

- **Daily rent loss** = monthly rent × 12 ÷ 365
- **Days vacant** = move-out → move-in (or today)
- **Vacancy cost** = daily rent loss × days vacant
- **Status** = 🟢/🟡/🔴 from the next open committed deadline
- **Scorecard** = per-manager rollup of turn time, on-time %, cost, and more
- **Balance** = charges + late fees − payments − credits (deposits excluded),
  always recomputed from ledger entries, in integer cents
- **Rent collected on time** = share of monthly rent charges fully paid by
  their due date, applying payments to the oldest charges first
- **Late fee** = flat fee, posted the day after due date + grace days if that
  month's rent isn't fully paid
- **Owner response time** = hours from request to approve/decline; on time =
  answered by the due-by date
