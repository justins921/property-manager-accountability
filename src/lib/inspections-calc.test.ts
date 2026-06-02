import { describe, expect, it } from "vitest";
import {
  advanceScheduleDate,
  buildInspectionScorecard,
  completedOnTime,
  daysUntilDue,
  nextDueAfter,
  routineInspectionStatus,
} from "./inspections-calc";
import type { PropertyInspection, PropertyInspectionItem } from "./types";

function makeInspection(
  overrides: Partial<PropertyInspection> = {},
): PropertyInspection {
  return {
    id: "i1",
    org_id: "o1",
    property_id: "p1",
    schedule_id: "s1",
    template_id: null,
    building_id: null,
    unit_id: null,
    manager_id: "m1",
    due_date: "2026-06-01",
    completed_at: null,
    completed_by: null,
    overall_notes: null,
    created_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("advanceScheduleDate", () => {
  it("advances by the right period", () => {
    expect(advanceScheduleDate("2026-01-31", "weekly")).toEqual(
      new Date(2026, 1, 7),
    );
    expect(advanceScheduleDate("2026-01-15", "monthly")).toEqual(
      new Date(2026, 1, 15),
    );
    expect(advanceScheduleDate("2026-01-15", "quarterly")).toEqual(
      new Date(2026, 3, 15),
    );
    expect(advanceScheduleDate("2026-01-15", "semiannual")).toEqual(
      new Date(2026, 6, 15),
    );
    expect(advanceScheduleDate("2026-01-15", "annual")).toEqual(
      new Date(2027, 0, 15),
    );
  });
});

describe("nextDueAfter", () => {
  it("rolls forward past the as-of date", () => {
    // Anchor far in the past; monthly cadence; should land in the future.
    const next = nextDueAfter("2026-01-01", "monthly", new Date(2026, 4, 10));
    // First date strictly after May 10 stepping monthly from Jan 1 → Jun 1.
    expect(next).toEqual(new Date(2026, 5, 1));
  });
});

describe("daysUntilDue", () => {
  it("is positive before due and negative after", () => {
    const v = makeInspection({ due_date: "2026-06-01" });
    expect(daysUntilDue(v, new Date(2026, 4, 27))).toBe(5);
    expect(daysUntilDue(v, new Date(2026, 5, 8))).toBe(-7);
  });
});

describe("routineInspectionStatus", () => {
  it("green when far out", () => {
    expect(routineInspectionStatus(makeInspection(), new Date(2026, 4, 1))).toBe(
      "green",
    );
  });
  it("yellow within the window", () => {
    expect(
      routineInspectionStatus(makeInspection(), new Date(2026, 4, 28)),
    ).toBe("yellow");
  });
  it("red when overdue", () => {
    expect(routineInspectionStatus(makeInspection(), new Date(2026, 5, 5))).toBe(
      "red",
    );
  });
  it("green when completed even if late", () => {
    const v = makeInspection({ completed_at: "2026-06-10T12:00:00Z" });
    expect(routineInspectionStatus(v, new Date(2026, 5, 20))).toBe("green");
  });
});

describe("completedOnTime", () => {
  it("null when not completed", () => {
    expect(completedOnTime(makeInspection())).toBeNull();
  });
  it("true when finished on or before due", () => {
    expect(
      completedOnTime(makeInspection({ completed_at: "2026-06-01T09:00:00Z" })),
    ).toBe(true);
  });
  it("false when finished after due", () => {
    expect(
      completedOnTime(makeInspection({ completed_at: "2026-06-03T09:00:00Z" })),
    ).toBe(false);
  });
});

describe("buildInspectionScorecard", () => {
  it("aggregates completion, overdue, on-time, and open issues", () => {
    const onTime = makeInspection({
      id: "a",
      completed_at: "2026-06-01T09:00:00Z",
    });
    const late = makeInspection({
      id: "b",
      due_date: "2026-05-01",
      completed_at: "2026-05-05T09:00:00Z",
    });
    const overdue = makeInspection({ id: "c", due_date: "2026-05-20" });

    const items: PropertyInspectionItem[] = [
      {
        id: "it1",
        org_id: "o1",
        inspection_id: "a",
        area_key: "curb_appeal",
        area_label: "Curb appeal",
        photo_required: false,
        min_photos: 0,
        result: "needs_attention",
        notes: null,
        created_at: "",
      },
      {
        id: "it2",
        org_id: "o1",
        inspection_id: "b",
        area_key: "weeds",
        area_label: "Weeds",
        photo_required: false,
        min_photos: 0,
        result: "pass",
        notes: null,
        created_at: "",
      },
    ];

    const card = buildInspectionScorecard(
      "m1",
      [onTime, late, overdue],
      items,
      new Date(2026, 5, 1),
    );
    expect(card.total).toBe(3);
    expect(card.completed).toBe(2);
    expect(card.overdue).toBe(1);
    expect(card.onTimePct).toBe(50); // 1 of 2 completed on time
    expect(card.openIssues).toBe(1);
  });
});
