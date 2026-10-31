import { baseCategories, type CategoryDef } from "./catalog";

/*
 * Mock API. Swap these for real fetch calls once the backend exists; the shapes
 * already match what the UI expects.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Categories the server adds without a frontend deploy, e.g. for a campus event week. */
const remoteOnly: CategoryDef[] = [
  {
    id: "tickets",
    label: "Tickets & events",
    icon: "Ticket",
    blurb: "Concerts, sports, campus events",
    noCondition: true,
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Concert", "Sports", "Party", "Talk", "Trip"], filter: true },
      { key: "date", label: "Event date", type: "text", placeholder: "e.g. Sat 14 Nov" },
      { key: "venue", label: "Venue", type: "text" },
    ],
  },
];

export async function fetchCategories(): Promise<CategoryDef[]> {
  await delay(450);
  return [...baseCategories, ...remoteOnly];
}
