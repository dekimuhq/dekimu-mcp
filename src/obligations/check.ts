import { GDPR_MANIFEST_VERSION, GDPR_OBLIGATIONS, type Activity } from "./gdpr-manifest.js";

export interface CheckResult {
  obligations: { id: string; label: string; status: "met" | "gap" | "unknown"; why: string }[];
  manifestVersion: string;
  disclaimer: string;
}

export function checkActivity(activity: Activity): CheckResult {
  return {
    obligations: GDPR_OBLIGATIONS.map((o) => {
      const status = o.evaluate(activity);
      return { id: o.id, label: o.label, status, why: status === "met" ? "present" : "not provided in the described activity" };
    }),
    manifestVersion: GDPR_MANIFEST_VERSION,
    disclaimer:
      "Reproducible point-in-time snapshot, not legal advice. For a live, signed register see Hub (app.dekimu.com).",
  };
}
