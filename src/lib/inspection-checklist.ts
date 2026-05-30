// The default routine-inspection checklist. This is a code constant for v1;
// owner-customizable templates are a future enhancement. `key` is what's stored
// on each inspection item (stable identifier); `label` is shown in the UI.

export interface ChecklistArea {
  key: string;
  label: string;
  hint?: string;
}

export const DEFAULT_CHECKLIST: ChecklistArea[] = [
  {
    key: "curb_appeal",
    label: "Curb appeal",
    hint: "Overall first impression from the street",
  },
  {
    key: "landscaping_weeds",
    label: "Landscaping & weeds",
    hint: "Lawn, beds, weeds, overgrowth",
  },
  {
    key: "trash_dumpster",
    label: "Trash & dumpster area",
    hint: "Bins, overflow, debris",
  },
  {
    key: "parking_lot",
    label: "Parking lot & drive",
    hint: "Surface, striping, potholes",
  },
  {
    key: "building_exterior",
    label: "Building exterior",
    hint: "Siding, paint, gutters, damage",
  },
  {
    key: "common_areas",
    label: "Common areas / hallways",
    hint: "Cleanliness, lighting, wear",
  },
  {
    key: "roof_gutters",
    label: "Roof & gutters",
    hint: "Visible damage, debris, sagging",
  },
  {
    key: "safety_lighting",
    label: "Safety & exterior lighting",
    hint: "Lights working, hazards, railings",
  },
  {
    key: "signage_entry",
    label: "Signage & entry",
    hint: "Signs, gates, entry condition",
  },
];

export const CHECKLIST_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_CHECKLIST.map((a) => [a.key, a.label]),
);
