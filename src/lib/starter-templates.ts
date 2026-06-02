// Pre-built "starter" inspection templates owners can add in one click, with
// sensible per-item photo requirements already set. These are the
// auto-generated monthly/quarterly/annual interior & exterior checklists.
import type { InspectionFrequency, TemplateCategory } from "./types";

export interface StarterItem {
  label: string;
  hint?: string;
  photo_required: boolean;
  min_photos: number;
}

export interface StarterTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  frequency: InspectionFrequency;
  description: string;
  items: StarterItem[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "monthly_exterior_driveby",
    name: "Monthly Exterior Drive-By",
    category: "exterior",
    frequency: "monthly",
    description:
      "Quick monthly check that the property looks good from the curb.",
    items: [
      {
        label: "Front of property / curb appeal",
        hint: "Wide shot showing the whole front and yard",
        photo_required: true,
        min_photos: 2,
      },
      {
        label: "Landscaping & weeds",
        hint: "Lawn mowed, beds maintained, no overgrowth",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Trash & dumpster area",
        hint: "No overflow or scattered debris",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Parking lot & drive",
        hint: "No major potholes, debris, or abandoned vehicles",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Building exterior (visible damage)",
        hint: "Siding, paint, gutters from the ground",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Signage & exterior lighting",
        hint: "Signs intact, lights working",
        photo_required: false,
        min_photos: 0,
      },
    ],
  },
  {
    key: "quarterly_interior",
    name: "Quarterly Interior Inspection",
    category: "interior",
    frequency: "quarterly",
    description: "In-unit walkthrough of safety, systems, and condition.",
    items: [
      {
        label: "Smoke & CO detectors",
        hint: "Present and working — test the button",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "HVAC / furnace filter",
        hint: "Replace if dirty; photo of the new filter installed",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Water heater",
        hint: "No leaks or corrosion; photo of the unit and surrounding area",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Under-sink & visible plumbing",
        hint: "Kitchen and bathrooms — check for leaks",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Walls & ceilings",
        hint: "Water stains, cracks, holes",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Flooring",
        hint: "Damage or excessive wear",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Windows & doors",
        hint: "Open, close, and lock properly",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "GFCI outlets (kitchen/bath)",
        hint: "Test and reset",
        photo_required: false,
        min_photos: 0,
      },
    ],
  },
  {
    key: "annual_exterior_detailed",
    name: "Annual Detailed Exterior",
    category: "exterior",
    frequency: "annual",
    description: "Thorough yearly exterior and building-envelope inspection.",
    items: [
      {
        label: "Roof & gutters",
        hint: "Visible damage, debris, sagging, downspouts",
        photo_required: true,
        min_photos: 2,
      },
      {
        label: "Foundation",
        hint: "Cracks, settling, signs of water intrusion",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Siding & paint",
        hint: "Rot, peeling, damage",
        photo_required: true,
        min_photos: 2,
      },
      {
        label: "Windows & seals (exterior)",
        hint: "Caulking, frames, broken panes",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Drainage & grading",
        hint: "Water flows away from the building",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Exterior electrical & lighting",
        hint: "Fixtures, outlets, panels",
        photo_required: false,
        min_photos: 0,
      },
      {
        label: "Decks, stairs & railings",
        hint: "Safety — secure and free of rot",
        photo_required: true,
        min_photos: 1,
      },
      {
        label: "Walkways & parking surface",
        hint: "Trip hazards, cracks",
        photo_required: false,
        min_photos: 0,
      },
    ],
  },
];

export function getStarter(key: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((s) => s.key === key);
}
