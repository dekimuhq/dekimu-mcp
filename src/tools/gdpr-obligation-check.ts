import { z } from "zod";
import { checkActivity } from "../obligations/check.js";

export const gdprInputSchema = {
  purpose: z.string(),
  lawfulBasis: z.string().optional(),
  dataCategories: z.array(z.string()).optional(),
  dataSubjects: z.array(z.string()).optional(),
  retention: z.string().optional(),
};

export function gdprHandler(args: {
  purpose: string;
  lawfulBasis?: string;
  dataCategories?: string[];
  dataSubjects?: string[];
  retention?: string;
}) {
  return { content: [{ type: "text" as const, text: JSON.stringify(checkActivity(args), null, 2) }] };
}
