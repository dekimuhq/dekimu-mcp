export const digestLatestInputSchema = {};

export const readOnly = true;

export async function digestLatestHandler() {
  const path = process.env.ECOSYSTEM_DIGEST_PATH;
  if (!path) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ available: false, reason: "ECOSYSTEM_DIGEST_PATH not configured" }),
        },
      ],
    };
  }
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    const digest: unknown = JSON.parse(raw);
    return { content: [{ type: "text" as const, text: JSON.stringify(digest) }] };
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ available: false, reason: "digest not readable" }),
        },
      ],
    };
  }
}
