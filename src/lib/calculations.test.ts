import { describe, expect, it } from "vitest";
import {
  answeredOnTime,
  autopayChargeDue,
  autopayState,
  buildOwnerScorecard,
  buildOwnerScorecards,
  buildRentCollection,
  buildScorecard,
  chargePaidBy,
  dailyRentLoss,
  depositCollected,
  lateFeesDue,
  leaseEndsWithin,
  ledgerBalance,
  monthStatus,
  nextDueDateOnOrAfter,
  occupancyLabel,
  pastDueBalance,
  rentPeriodsDue,
  rentReminderDue,
  responseHours,
  suggestedProration,
  type LedgerLike,
  daysVacant,
  dueReminder,
  missedDeadlines,
  nextDeadline,
  turnTime,
  vacancyCost,
  vacancyStatus,
} from "./calculations";
import type { Lease, OwnerRequest, Vacancy } from "./types";

// A baseline vacancy: moved out 2026-01-01, all milestones still open.
function makeVacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: "v1",
    org_id: "o1",
    property_id: "p1",
    unit_id: null,
    manager_id: "m1",
    unit_number: "205",
    monthly_rent: 1500,
    move_out_date: "2026-01-01",
    expected_make_ready_date: "2026-01-15",
    expected_listing_date: "2026-01-18",
    expected_lease_signing_date: "2026-02-01",
    expected_move_in_date: "2026-02-12",
    actual_make_ready_date: null,
    date_listed: null,
    date_applications_received: null,
    date_lease_signed: null,
    actual_move_in_date: null,
    stage: "created",
    closed_at: null,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("dailyRentLoss", () => {
  it("converts monthly rent to a daily rate", () => {
    // 1500 * 12 / 365 ≈ 49.315
    expect(dailyRentLoss(1500)).toBeCloseTo(49.315, 2);
  });
});

describe("daysVacant", () => {
  it("counts from move-out to the as-of date when still vacant", () => {
    const v = makeVacancy();
    expect(daysVacant(v, new Date(2026, 1, 12))).toBe(42); // Jan 1 → Feb 12
  });

  it("counts to actual move-in when leased", () => {
    const v = makeVacancy({ actual_move_in_date: "2026-02-12" });
    expect(daysVacant(v, new Date(2026, 5, 1))).toBe(42);
  });

  it("never returns a negative number", () => {
    const v = makeVacancy();
    expect(daysVacant(v, new Date(2025, 11, 1))).toBe(0);
  });
});

describe("vacancyCost", () => {
  it("matches the spec example: $1,500 rent, 42 days ≈ $2,100", () => {
    const v = makeVacancy();
    expect(vacancyCost(v, new Date(2026, 1, 12))).toBeCloseTo(2071.23, 0);
  });
});

describe("nextDeadline", () => {
  it("returns the earliest open milestone", () => {
    const v = makeVacancy();
    const next = nextDeadline(v, new Date(2026, 0, 10));
    expect(next?.type).toBe("make_ready");
    expect(next?.daysUntil).toBe(5); // Jan 10 → Jan 15
  });

  it("skips completed milestones", () => {
    const v = makeVacancy({ actual_make_ready_date: "2026-01-14" });
    const next = nextDeadline(v, new Date(2026, 0, 16));
    expect(next?.type).toBe("listing");
  });

  it("returns null when everything is complete", () => {
    const v = makeVacancy({
      actual_make_ready_date: "2026-01-14",
      date_listed: "2026-01-16",
      date_lease_signed: "2026-01-30",
      actual_move_in_date: "2026-02-10",
    });
    expect(nextDeadline(v)).toBeNull();
  });
});

describe("vacancyStatus", () => {
  it("is green when comfortably ahead of the next deadline", () => {
    expect(vacancyStatus(makeVacancy(), new Date(2026, 0, 5))).toBe("green");
  });

  it("is yellow within the warning window", () => {
    expect(vacancyStatus(makeVacancy(), new Date(2026, 0, 14))).toBe("yellow");
  });

  it("is red once a deadline is missed", () => {
    expect(vacancyStatus(makeVacancy(), new Date(2026, 0, 20))).toBe("red");
  });

  it("is green when completed", () => {
    const v = makeVacancy({ stage: "completed" });
    expect(vacancyStatus(v, new Date(2026, 5, 1))).toBe("green");
  });
});

describe("turnTime", () => {
  it("is null until make-ready completes", () => {
    expect(turnTime(makeVacancy())).toBeNull();
  });
  it("measures move-out to make-ready completion", () => {
    expect(turnTime(makeVacancy({ actual_make_ready_date: "2026-01-19" }))).toBe(
      18,
    );
  });
});

describe("missedDeadlines", () => {
  it("counts past-due open milestones", () => {
    // As of Jan 20, make-ready (Jan 15) and listing (Jan 18) are overdue.
    expect(missedDeadlines(makeVacancy(), new Date(2026, 0, 20))).toBe(2);
  });

  it("counts milestones completed late", () => {
    const v = makeVacancy({ actual_make_ready_date: "2026-01-20" }); // 5 days late
    expect(missedDeadlines(v, new Date(2026, 0, 10))).toBe(1);
  });
});

describe("dueReminder", () => {
  const base = { type: "make_ready" as const, date: new Date() };
  it("fires the day before", () => {
    expect(dueReminder({ ...base, daysUntil: 1 })?.type).toBe("pre_deadline");
  });
  it("fires on the deadline day", () => {
    expect(dueReminder({ ...base, daysUntil: 0 })?.type).toBe("deadline_day");
  });
  it("fires at 3 / 7 / 14 days overdue", () => {
    expect(dueReminder({ ...base, daysUntil: -3 })?.type).toBe("overdue_3");
    expect(dueReminder({ ...base, daysUntil: -7 })?.type).toBe("overdue_7");
    expect(dueReminder({ ...base, daysUntil: -14 })?.type).toBe("overdue_14");
  });
  it("is silent on other days", () => {
    expect(dueReminder({ ...base, daysUntil: 5 })).toBeNull();
    expect(dueReminder({ ...base, daysUntil: -5 })).toBeNull();
  });
});

describe("buildScorecard", () => {
  it("aggregates turn time and on-time completion", () => {
    const onTime = makeVacancy({
      id: "a",
      actual_make_ready_date: "2026-01-15", // exactly on time
    });
    const late = makeVacancy({
      id: "b",
      actual_make_ready_date: "2026-01-20", // 5 days late
    });
    const card = buildScorecard("m1", [onTime, late], new Date(2026, 0, 25));
    expect(card.totalVacancies).toBe(2);
    expect(card.avgTurnTime).toBeCloseTo((14 + 19) / 2, 5);
    // 2 completed milestones, 1 on time → 50%
    expect(card.onTimeCompletionPct).toBe(50);
  });
});

// ── Rent ledger ─────────────────────────────────────────────────────────────

function entry(
  type: LedgerLike["type"],
  amount: number,
  entry_date: string,
  auto_key: string | null = null,
): LedgerLike {
  return { type, amount, entry_date, auto_key, created_at: `${entry_date}T12:00:00Z` };
}

function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: "l1",
    org_id: "o1",
    property_id: "p1",
    unit_id: "u1",
    vacancy_id: null,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    monthly_rent: 1500,
    rent_due_day: 1,
    security_deposit: 1500,
    late_fee_amount: 75,
    late_fee_grace_days: 5,
    billing_start_date: "2026-01-01",
    status: "active",
    ended_on: null,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    autopay_enabled: false,
    autopay_payment_method_id: null,
    autopay_method_label: null,
    autopay_enabled_at: null,
    ...overrides,
  };
}

describe("ledgerBalance", () => {
  it("adds charges and late fees, subtracts payments and credits, ignores deposits", () => {
    const entries = [
      entry("charge", 1500, "2026-01-01"),
      entry("late_fee", 75, "2026-01-07"),
      entry("payment", 1000, "2026-01-10"),
      entry("credit", 25, "2026-01-11"),
      entry("deposit", 1500, "2026-01-01"),
    ];
    expect(ledgerBalance(entries)).toBe(550);
  });

  it("is exact with cents (no float drift)", () => {
    const entries = [
      entry("charge", 0.1, "2026-01-01"),
      entry("charge", 0.2, "2026-01-01"),
    ];
    expect(ledgerBalance(entries)).toBe(0.3);
  });

  it("goes negative when prepaid", () => {
    expect(ledgerBalance([entry("payment", 200, "2026-01-01")])).toBe(-200);
  });

  it("only counts entries on or before asOf", () => {
    const entries = [
      entry("charge", 1500, "2026-01-01"),
      entry("payment", 1500, "2026-01-05"),
    ];
    expect(ledgerBalance(entries, "2026-01-04")).toBe(1500);
    expect(ledgerBalance(entries, "2026-01-05")).toBe(0);
  });
});

describe("pastDueBalance", () => {
  it("doesn't count rent due today", () => {
    const entries = [entry("charge", 1500, "2026-02-01")];
    expect(pastDueBalance(entries, new Date(2026, 1, 1))).toBe(0);
    expect(pastDueBalance(entries, new Date(2026, 1, 2))).toBe(1500);
  });

  it("never goes below zero", () => {
    const entries = [entry("charge", 100, "2026-01-01"), entry("payment", 300, "2026-01-01")];
    expect(pastDueBalance(entries, new Date(2026, 1, 1))).toBe(0);
  });
});

describe("depositCollected", () => {
  it("sums deposit entries only", () => {
    const entries = [entry("deposit", 500, "2026-01-01"), entry("deposit", 250.5, "2026-01-02"), entry("payment", 99, "2026-01-02")];
    expect(depositCollected(entries)).toBe(750.5);
  });
});

describe("nextDueDateOnOrAfter", () => {
  it("uses this month when the due day hasn't passed", () => {
    expect(nextDueDateOnOrAfter("2026-03-01", 1)).toBe("2026-03-01");
    expect(nextDueDateOnOrAfter("2026-03-03", 5)).toBe("2026-03-05");
  });
  it("rolls to next month (and year) when it has", () => {
    expect(nextDueDateOnOrAfter("2026-03-15", 1)).toBe("2026-04-01");
    expect(nextDueDateOnOrAfter("2026-12-15", 1)).toBe("2027-01-01");
  });
});

describe("rentPeriodsDue", () => {
  it("posts one charge per month on the due day through today", () => {
    const periods = rentPeriodsDue(makeLease(), new Date(2026, 2, 15));
    expect(periods).toEqual([
      { period: "2026-01", dueDate: "2026-01-01" },
      { period: "2026-02", dueDate: "2026-02-01" },
      { period: "2026-03", dueDate: "2026-03-01" },
    ]);
  });

  it("includes today when today is the due day", () => {
    const periods = rentPeriodsDue(makeLease(), new Date(2026, 1, 1));
    expect(periods.map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
  });

  it("starts at billing_start_date so existing tenants aren't back-billed", () => {
    const lease = makeLease({ start_date: "2024-06-01", billing_start_date: "2026-03-01" });
    expect(rentPeriodsDue(lease, new Date(2026, 2, 20)).map((p) => p.period)).toEqual(["2026-03"]);
  });

  it("skips a partial first month (prorated by hand)", () => {
    const lease = makeLease({ start_date: "2026-01-15", billing_start_date: "2026-02-01" });
    expect(rentPeriodsDue(lease, new Date(2026, 1, 10)).map((p) => p.period)).toEqual(["2026-02"]);
  });

  it("respects a later due day", () => {
    const lease = makeLease({ rent_due_day: 5 });
    expect(rentPeriodsDue(lease, new Date(2026, 1, 4)).map((p) => p.dueDate)).toEqual(["2026-01-05"]);
  });

  it("keeps billing past end_date (holdover) but stops at ended_on", () => {
    const holdover = makeLease({ end_date: "2026-01-31" });
    expect(rentPeriodsDue(holdover, new Date(2026, 2, 2))).toHaveLength(3);
    const ended = makeLease({ status: "ended", ended_on: "2026-02-15" });
    expect(rentPeriodsDue(ended, new Date(2026, 5, 1)).map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
  });

  it("posts nothing for upcoming leases", () => {
    expect(rentPeriodsDue(makeLease({ status: "upcoming" }), new Date(2026, 5, 1))).toEqual([]);
  });
});

describe("suggestedProration", () => {
  it("prorates by the start month's actual days", () => {
    // Jan 15 → Feb 1 = 17 of 31 days.
    expect(suggestedProration(1550, "2026-01-15", "2026-02-01")).toBe(850);
  });
  it("is zero when there's no gap", () => {
    expect(suggestedProration(1500, "2026-02-01", "2026-02-01")).toBe(0);
  });
  it("never exceeds a full month", () => {
    expect(suggestedProration(1500, "2026-01-01", "2026-03-01")).toBe(1500);
  });
});

describe("chargePaidBy", () => {
  it("applies payments to the oldest charge first", () => {
    const jan = entry("charge", 1000, "2026-01-01", "rent:2026-01");
    const feb = entry("charge", 1000, "2026-02-01", "rent:2026-02");
    const entries = [jan, feb, entry("payment", 1000, "2026-02-01")];
    // The Feb payment clears January's rent, not February's.
    expect(chargePaidBy(entries, jan, "2026-02-01")).toBe(true);
    expect(chargePaidBy(entries, feb, "2026-02-01")).toBe(false);
  });

  it("ignores payments after the cutoff", () => {
    const jan = entry("charge", 1000, "2026-01-01", "rent:2026-01");
    const entries = [jan, entry("payment", 1000, "2026-01-02")];
    expect(chargePaidBy(entries, jan, "2026-01-01")).toBe(false);
    expect(chargePaidBy(entries, jan, "2026-01-02")).toBe(true);
  });
});

describe("lateFeesDue", () => {
  const lease = makeLease();
  const jan = entry("charge", 1500, "2026-01-01", "rent:2026-01");

  it("posts the day after the grace period when rent is unpaid", () => {
    // Due Jan 1 + 5 grace days = Jan 6 is the last day; fee posts Jan 7.
    expect(lateFeesDue(lease, [jan], new Date(2026, 0, 6))).toEqual([]);
    expect(lateFeesDue(lease, [jan], new Date(2026, 0, 7))).toEqual([
      { period: "2026-01", autoKey: "late:2026-01", entryDate: "2026-01-07", amount: 75 },
    ]);
  });

  it("doesn't post when paid within the grace period", () => {
    const entries = [jan, entry("payment", 1500, "2026-01-06")];
    expect(lateFeesDue(lease, entries, new Date(2026, 0, 20))).toEqual([]);
  });

  it("posts when only partly paid", () => {
    const entries = [jan, entry("payment", 1400, "2026-01-03")];
    expect(lateFeesDue(lease, entries, new Date(2026, 0, 20))).toHaveLength(1);
  });

  it("is idempotent: skips months that already have a late fee", () => {
    const entries = [jan, entry("late_fee", 75, "2026-01-07", "late:2026-01")];
    expect(lateFeesDue(lease, entries, new Date(2026, 0, 20))).toEqual([]);
  });

  it("an unpaid old late fee doesn't trigger a new one once rent is paid", () => {
    const feb = entry("charge", 1500, "2026-02-01", "rent:2026-02");
    const entries = [
      jan,
      entry("payment", 1500, "2026-01-20"),
      entry("late_fee", 75, "2026-01-07", "late:2026-01"),
      feb,
      entry("payment", 1575, "2026-02-03"),
    ];
    expect(lateFeesDue(lease, entries, new Date(2026, 1, 20))).toEqual([]);
  });

  it("posts nothing when the lease has no late fee", () => {
    expect(lateFeesDue(makeLease({ late_fee_amount: 0 }), [jan], new Date(2026, 0, 20))).toEqual([]);
  });

  it("ignores manual charges", () => {
    const manual = entry("charge", 1500, "2026-01-01");
    expect(lateFeesDue(lease, [manual], new Date(2026, 0, 20))).toEqual([]);
  });
});

describe("occupancyLabel / leaseEndsWithin", () => {
  const today = new Date(2026, 5, 1);
  it("labels month-to-month, holdover and active", () => {
    expect(occupancyLabel(makeLease({ end_date: null }), today)).toBe("Month-to-month");
    expect(occupancyLabel(makeLease({ end_date: "2026-05-31" }), today)).toBe("Holdover");
    expect(occupancyLabel(makeLease({ end_date: "2026-06-01" }), today)).toBe("Active");
    expect(occupancyLabel(makeLease({ status: "terminated" }), today)).toBe("Terminated");
  });
  it("finds leases ending in the window", () => {
    expect(leaseEndsWithin(makeLease({ end_date: "2026-07-31" }), 60, today)).toBe(true);
    expect(leaseEndsWithin(makeLease({ end_date: "2026-08-01" }), 60, today)).toBe(false);
    expect(leaseEndsWithin(makeLease({ end_date: "2026-05-31" }), 60, today)).toBe(false);
    expect(leaseEndsWithin(makeLease({ end_date: null }), 60, today)).toBe(false);
    expect(leaseEndsWithin(makeLease({ end_date: "2026-07-01", status: "ended" }), 60, today)).toBe(false);
  });
});

describe("buildRentCollection", () => {
  it("measures % of rent paid by the due date and past-due balance", () => {
    const leaseA = [
      entry("charge", 1000, "2026-01-01", "rent:2026-01"),
      entry("payment", 1000, "2026-01-01"), // on time
      entry("charge", 1000, "2026-02-01", "rent:2026-02"),
      entry("payment", 1000, "2026-02-04"), // late
    ];
    const leaseB = [
      entry("charge", 800, "2026-02-01", "rent:2026-02"), // unpaid
      entry("charge", 800, "2026-03-01", "rent:2026-03"), // due today: not counted yet
    ];
    const stats = buildRentCollection("m1", [{ entries: leaseA }, { entries: leaseB }], new Date(2026, 2, 1));
    expect(stats.rentCharges).toBe(3);
    expect(stats.paidOnTime).toBe(1);
    expect(stats.onTimePct).toBeCloseTo(33.33, 1);
    expect(stats.pastDueBalance).toBe(800);
  });

  it("is null with no rent history", () => {
    expect(buildRentCollection(null, [], new Date()).onTimePct).toBeNull();
  });
});

// ── Owner requests ──────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<OwnerRequest> = {}): OwnerRequest {
  return {
    id: "r1",
    org_id: "o1",
    property_id: null,
    vacancy_id: null,
    type: "spending",
    title: "Replace water heater",
    details: null,
    amount: 1200,
    due_by: "2026-03-05",
    status: "pending",
    requested_by: "m1",
    created_at: "2026-03-01T12:00:00Z",
    responded_by: null,
    responded_at: null,
    response_note: null,
    ...overrides,
  };
}

describe("owner request timing", () => {
  it("measures response time in hours", () => {
    const r = makeRequest({ status: "approved", responded_by: "o1", responded_at: "2026-03-02T18:00:00Z" });
    expect(responseHours(r)).toBe(30);
    expect(responseHours(makeRequest())).toBeNull();
  });

  it("judges on-time against due_by; pending past due is late", () => {
    const onTime = makeRequest({ status: "approved", responded_at: "2026-03-04T15:00:00Z" });
    expect(answeredOnTime(onTime, new Date(2026, 2, 10))).toBe(true);
    expect(answeredOnTime(makeRequest(), new Date(2026, 2, 5))).toBeNull();
    expect(answeredOnTime(makeRequest(), new Date(2026, 2, 6))).toBe(false);
    expect(answeredOnTime(makeRequest({ status: "withdrawn" }), new Date(2026, 2, 6))).toBeNull();
  });
});

describe("buildOwnerScorecard", () => {
  const asOf = new Date(2026, 2, 10);
  const requests = [
    makeRequest({ id: "a", status: "approved", responded_by: "o1", responded_at: "2026-03-01T22:00:00Z" }), // 10h, on time
    makeRequest({ id: "b", status: "declined", responded_by: "o2", responded_at: "2026-03-07T12:00:00Z" }), // 144h, late
    makeRequest({ id: "c" }), // pending, overdue
    makeRequest({ id: "d", due_by: "2026-03-20" }), // pending, not due
    makeRequest({ id: "e", status: "withdrawn" }), // ignored
  ];

  it("rolls up the whole org", () => {
    const s = buildOwnerScorecard(null, requests, asOf);
    expect(s.total).toBe(4);
    expect(s.answered).toBe(2);
    expect(s.approved).toBe(1);
    expect(s.declined).toBe(1);
    expect(s.pending).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.avgResponseHours).toBe(77);
    // on time: a ✓, b ✗, c ✗ (overdue); d not judged yet.
    expect(s.onTimePct).toBeCloseTo(33.33, 1);
  });

  it("splits answered requests by the owner who answered", () => {
    const cards = buildOwnerScorecards(requests, asOf);
    expect(cards.map((c) => c.ownerId).sort()).toEqual(["o1", "o2"]);
    expect(cards.find((c) => c.ownerId === "o1")?.avgResponseHours).toBe(10);
  });
});

// ── Online rent collection ──────────────────────────────────────────────────

describe("autopayChargeDue", () => {
  const lease = makeLease({
    autopay_enabled: true,
    autopay_payment_method_id: "pm_1",
    autopay_enabled_at: "2026-02-15T12:00:00Z",
  });
  const mar = entry("charge", 1500, "2026-03-01", "rent:2026-03");

  it("charges the balance on the due date", () => {
    expect(autopayChargeDue(lease, [mar], [], new Date(2026, 2, 1))).toEqual({
      period: "2026-03",
      attempt: 1,
      amount: 1500,
    });
  });

  it("doesn't charge a month due before the tenant turned autopay on", () => {
    const feb = entry("charge", 1500, "2026-02-01", "rent:2026-02");
    expect(autopayChargeDue(lease, [feb], [], new Date(2026, 1, 20))).toBeNull();
  });

  it("does nothing when nothing is owed, when off, or while a payment is processing", () => {
    const paid = [mar, entry("payment", 1500, "2026-02-28")];
    expect(autopayChargeDue(lease, paid, [], new Date(2026, 2, 1))).toBeNull();
    expect(autopayChargeDue({ ...lease, autopay_enabled: false }, [mar], [], new Date(2026, 2, 1))).toBeNull();
    expect(autopayChargeDue(lease, [mar], [], new Date(2026, 2, 1), { paymentProcessing: true })).toBeNull();
  });

  it("retries a failed charge every 3 days, up to 3 tries", () => {
    const failed1 = { period: "2026-03", attempt: 1, status: "failed" as const, attempted_on: "2026-03-01" };
    expect(autopayChargeDue(lease, [mar], [failed1], new Date(2026, 2, 3))).toBeNull();
    expect(autopayChargeDue(lease, [mar], [failed1], new Date(2026, 2, 4))?.attempt).toBe(2);
    const failed2 = { ...failed1, attempt: 2, attempted_on: "2026-03-04" };
    expect(autopayChargeDue(lease, [mar], [failed1, failed2], new Date(2026, 2, 7))?.attempt).toBe(3);
    const failed3 = { ...failed1, attempt: 3, attempted_on: "2026-03-07" };
    expect(autopayChargeDue(lease, [mar], [failed1, failed2, failed3], new Date(2026, 2, 20))).toBeNull();
  });

  it("never charges twice once a try succeeded or is processing", () => {
    const ok = { period: "2026-03", attempt: 1, status: "succeeded" as const, attempted_on: "2026-03-01" };
    const pending = { ...ok, status: "processing" as const };
    expect(autopayChargeDue(lease, [mar], [ok], new Date(2026, 2, 10))).toBeNull();
    expect(autopayChargeDue(lease, [mar], [pending], new Date(2026, 2, 10))).toBeNull();
  });

  it("reports the month's final autopay state", () => {
    const a = [
      { period: "2026-03", attempt: 1, status: "failed" as const, attempted_on: "2026-03-01" },
      { period: "2026-03", attempt: 2, status: "succeeded" as const, attempted_on: "2026-03-04" },
    ];
    expect(autopayState(a, "2026-03")).toBe("succeeded");
    expect(autopayState(a.slice(0, 1), "2026-03")).toBe("failed");
    expect(autopayState(a, "2026-04")).toBeNull();
  });
});

describe("rentReminderDue", () => {
  const lease = makeLease();
  const none = new Set<string>();

  it("sends an upcoming reminder 3 days before the due date, once", () => {
    const entries = [entry("charge", 1500, "2026-02-01", "rent:2026-02"), entry("payment", 1500, "2026-02-01")];
    expect(rentReminderDue(lease, entries, none, new Date(2026, 1, 25))).toBeNull();
    expect(rentReminderDue(lease, entries, none, new Date(2026, 1, 26))).toEqual({
      kind: "upcoming",
      period: "2026-03",
      dueDate: "2026-03-01",
      amount: 1500,
    });
    expect(rentReminderDue(lease, entries, new Set(["upcoming:2026-03"]), new Date(2026, 1, 27))).toBeNull();
  });

  it("includes any balance already owed in the upcoming amount, and skips prepaid tenants", () => {
    const owing = [entry("charge", 1500, "2026-02-01", "rent:2026-02"), entry("payment", 1000, "2026-02-03")];
    expect(rentReminderDue(lease, owing, new Set(["late:2026-02"]), new Date(2026, 1, 26))?.amount).toBe(2000);
    const prepaid = [entry("charge", 1500, "2026-02-01", "rent:2026-02"), entry("payment", 3000, "2026-02-01")];
    expect(rentReminderDue(lease, prepaid, none, new Date(2026, 1, 26))).toBeNull();
  });

  it("sends a late reminder the day after an unpaid due date", () => {
    const entries = [entry("charge", 1500, "2026-03-01", "rent:2026-03")];
    expect(rentReminderDue(lease, entries, none, new Date(2026, 2, 1))).toBeNull();
    expect(rentReminderDue(lease, entries, none, new Date(2026, 2, 2))).toEqual({
      kind: "late",
      period: "2026-03",
      dueDate: "2026-03-01",
      amount: 1500,
    });
  });

  it("skips the late reminder when rent was paid on time or it's long past", () => {
    const paid = [entry("charge", 1500, "2026-03-01", "rent:2026-03"), entry("payment", 1500, "2026-03-01")];
    expect(rentReminderDue(lease, paid, none, new Date(2026, 2, 2))).toBeNull();
    const unpaid = [entry("charge", 1500, "2026-03-01", "rent:2026-03")];
    expect(rentReminderDue(lease, unpaid, none, new Date(2026, 2, 20))).toBeNull();
  });
});

describe("monthStatus", () => {
  const lease = makeLease({ rent_due_day: 5 });
  it("is 'not due' before this month's rent posts", () => {
    expect(monthStatus(lease, [], new Date(2026, 2, 3))).toEqual({ state: "not_due", dueDate: "2026-03-05" });
  });
  it("is paid or outstanding once it posts", () => {
    const charge = entry("charge", 1500, "2026-03-05", "rent:2026-03");
    expect(monthStatus(lease, [charge], new Date(2026, 2, 6))).toEqual({ state: "outstanding", amount: 1500 });
    const paid = [charge, entry("payment", 1500, "2026-03-05")];
    expect(monthStatus(lease, paid, new Date(2026, 2, 6))).toEqual({ state: "paid" });
  });
});
