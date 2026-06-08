// Point-in-time GDPR obligation snapshot (vendored). NOT live legal advice.
// Mirrors the obligation IDs used by @dekimuhq/compass-obligations without importing it.
export const GDPR_MANIFEST_VERSION = "gdpr-snapshot-2026-06-08";

export interface Activity {
  purpose: string;
  lawfulBasis?: string;
  dataCategories?: string[];
  dataSubjects?: string[];
  retention?: string;
}

export interface Obligation {
  id: string;
  label: string;
  evaluate: (a: Activity) => "met" | "gap" | "unknown";
}

export const GDPR_OBLIGATIONS: Obligation[] = [
  { id: "lawful-basis", label: "Art.6 lawful basis identified", evaluate: (a) => (a.lawfulBasis ? "met" : "gap") },
  { id: "purpose", label: "Art.5(1)(b) purpose specified", evaluate: (a) => (a.purpose ? "met" : "gap") },
  { id: "retention", label: "Art.5(1)(e) retention period set", evaluate: (a) => (a.retention ? "met" : "gap") },
  { id: "data-minimisation", label: "Art.5(1)(c) data categories declared", evaluate: (a) => (a.dataCategories?.length ? "met" : "gap") },
];
