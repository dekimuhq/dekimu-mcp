#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mintInputSchema, mintHandler } from "./tools/mint-action-receipt.js";
import { verifyInputSchema, verifyHandler } from "./tools/verify-receipt.js";
import { gdprInputSchema, gdprHandler } from "./tools/gdpr-obligation-check.js";

const server = new McpServer({ name: "dekimu-mcp", version: "0.1.0" });

server.registerTool(
  "mint_action_receipt",
  {
    description:
      "Mint a tamper-evident, offline-verifiable receipt of an agent action, self-signed by a local key.",
    inputSchema: mintInputSchema,
  },
  async (args) => mintHandler(args, Date.now()),
);

server.registerTool(
  "verify_receipt",
  {
    description:
      "Verify a Dekimu/anchors receipt offline: structure + signature. Returns a result, never throws.",
    inputSchema: verifyInputSchema,
  },
  async (args) => verifyHandler(args),
);

server.registerTool(
  "gdpr_obligation_check",
  {
    description:
      "Run a reproducible GDPR obligation check on a described processing activity (bundled snapshot, not legal advice).",
    inputSchema: gdprInputSchema,
  },
  async (args) => gdprHandler(args),
);

await server.connect(new StdioServerTransport());
