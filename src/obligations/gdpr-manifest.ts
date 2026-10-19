// Point-in-time GDPR obligation snapshot (vendored). NOT live legal advice.
//
// Obligation ids are the ecosystem's canonical ids — the same strings used by the
// public Regulation-as-Code GDPR profile (github.com/dekimuhq/regulation-as-code,
// profiles/gdpr/v1.md, manifest `gdpr` 1.2.0) and by Dekimu Hub's Compass. They are
// vendored here and kept in sync by hand (no private dependency). This server
// evaluates the subset of that profile that a described activity can answer
// without an evidence corpus; the ids never diverge from the profile.
export const GDPR_MANIFEST_VERSION = "gdpr-1.2.0-snapshot-2026-10-19";

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
  { id: "gdpr.lawful-basis", label: "Art.6 lawful basis identified", evaluate: (a) => (a.lawfulBasis ? "met" : "gap") },
  { id: "gdpr.purpose-limitation", label: "Art.5(1)(b) purpose specified", evaluate: (a) => (a.purpose ? "met" : "gap") },
  { id: "gdpr.retention", label: "Art.5(1)(e) retention period set", evaluate: (a) => (a.retention ? "met" : "gap") },
];
