import { describe, expect, it } from "vitest";
import {
  buildScorecard,
  dailyRentLoss,
  daysVacant,
  dueReminder,
  missedDeadlines,
  nextDeadline,
  turnTime,
  vacancyCost,
  vacancyStatus,
} from "./calculations";
import type { Vacancy } from "./types";

// A baseline vacancy: moved out 2026-01-01, all milestones still open.
function makeVacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: "v1",
    org_id: "o1",
    property_id: "p1",
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
