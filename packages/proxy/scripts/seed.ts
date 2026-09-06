import "dotenv/config";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/client.js";
import defaultPolicies from "../src/policy/defaultPolicies.json" with { type: "json" };
import { evaluatePolicy } from "../src/policy/engine.js";
import type { PolicyRule } from "../src/policy/types.js";

/**
 * Seed script (spec §14 milestone 2 + 3):
 * - Admin user (from ADMIN_EMAIL / ADMIN_PASSWORD env)
 * - Default policies (upserted by name+toolPattern — preserves user edits)
 * - Fake historical ToolCallRequest + AuditLog rows so the dashboard is alive
 *   on first load. Each fake request is resolved through the real policy
 *   engine, so matchedPolicyId/name are always consistent with the rules.
 * Idempotent: clears requests/audit, upserts admin + policies.
 */

// ── Plausible agent reasoning strings (make the live feed feel real) ───────

const REASONINGS: Record<string, string[]> = {
  get_user: [
    "User requested account lookup for a support ticket",
    "Verifying customer identity before an order inquiry",
    "Pulling user profile for the dashboard view",
  ],
  list_orders: [
    "User asked for their recent order history",
    "Compiling an order summary for the weekly report",
    "Checking order status for a customer follow-up",
  ],
  read_inventory: [
    "Checking stock levels before recommending products",
    "Verifying availability for a customer order",
    "Running an inventory audit for the morning shift",
  ],
  transfer_funds: [
    "Processing a refund for a returned item",
    "Moving funds between company accounts",
    "Settling a vendor payment",
  ],
  read_user_pii: [
    "Pulling contact details for a marketing campaign",
    "Exporting customer data for the CRM migration",
    "Looking up a customer's phone number for delivery coordination",
  ],
  delete_user_record: [
    "User requested account cleanup, attempting to remove inactive record",
    "Removing duplicate customer entries",
    "Deleting a test account from the staging environment",
  ],
  drop_table: [
    "Attempting to reset the transactions table for a fresh start",
    "Clearing test data before the demo",
    "Dropping the orders table to rebuild the schema",
  ],
};

const DEFAULT_REASONING = "Standard operation requested by the user";

function pickReasoning(tool: string): string {
  const pool = REASONINGS[tool];
  return pool ? faker.helpers.arrayElement(pool) : DEFAULT_REASONING;
}

// ── Fake request generation ────────────────────────────────────────────────

type FakeStatus = "AUTO_ALLOWED" | "AUTO_BLOCKED" | "APPROVED" | "REJECTED" | "PENDING";

interface FakeRequest {
  agentName: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: FakeStatus;
  reasoning: string;
  result?: unknown;
  createdAt: Date;
  decidedAt?: Date | null;
}

function makeReadRequest(now: number): FakeRequest {
  const tool = faker.helpers.arrayElement(["get_user", "list_orders", "read_inventory"]);
  const createdAt = new Date(now - faker.number.int({ min: 0, max: 24 * 3600 * 1000 }));
  const toolInput =
    tool === "get_user"
      ? { id: `usr_${faker.string.alphanumeric(8)}` }
      : tool === "list_orders"
        ? { userId: faker.datatype.boolean() ? `usr_${faker.string.alphanumeric(8)}` : undefined }
        : { sku: faker.datatype.boolean() ? `${faker.string.alpha(4).toUpperCase()}-${faker.string.numeric(4)}` : undefined };
  return {
    agentName: "demo-agent-01",
    toolName: tool,
    toolInput,
    status: "AUTO_ALLOWED",
    reasoning: pickReasoning(tool),
    result: { ok: true, rows: faker.number.int({ min: 1, max: 25 }) },
    createdAt,
    decidedAt: new Date(createdAt.getTime() + faker.number.int({ min: 20, max: 400 })),
  };
}

function makeTransferRequest(now: number): FakeRequest {
  const amount = faker.number.float({ min: 5, max: 5000, fractionDigits: 2 });
  const createdAt = new Date(now - faker.number.int({ min: 0, max: 24 * 3600 * 1000 }));
  const toolInput = {
    from: faker.finance.accountNumber(8),
    to: faker.finance.accountNumber(8),
    amount,
  };
  // Small transfers auto-allow; large ones went to a human.
  const status: FakeStatus =
    amount <= 100
      ? "AUTO_ALLOWED"
      : faker.helpers.arrayElement(["APPROVED", "APPROVED", "REJECTED", "PENDING"]);
  const decidedAt =
    status === "PENDING" ? null : new Date(createdAt.getTime() + faker.number.int({ min: 2000, max: 60000 }));
  return {
    agentName: "demo-agent-01",
    toolName: "transfer_funds",
    toolInput,
    status,
    reasoning: pickReasoning("transfer_funds"),
    result: status === "APPROVED" || status === "AUTO_ALLOWED" ? { ok: true, txnId: `txn_${faker.string.alphanumeric(8)}` } : undefined,
    createdAt,
    decidedAt,
  };
}

function makePiiRequest(now: number): FakeRequest {
  const createdAt = new Date(now - faker.number.int({ min: 0, max: 24 * 3600 * 1000 }));
  const status: FakeStatus = faker.helpers.arrayElement(["APPROVED", "REJECTED", "PENDING"]);
  const decidedAt =
    status === "PENDING" ? null : new Date(createdAt.getTime() + faker.number.int({ min: 2000, max: 60000 }));
  return {
    agentName: "demo-agent-01",
    toolName: "read_user_pii",
    toolInput: { id: `usr_${faker.string.alphanumeric(8)}` },
    status,
    reasoning: pickReasoning("read_user_pii"),
    result: status === "APPROVED" ? { ok: true, pii: true } : undefined,
    createdAt,
    decidedAt,
  };
}

function makeDestructiveRequest(now: number): FakeRequest {
  const tool = faker.helpers.arrayElement(["delete_user_record", "drop_table"]);
  const createdAt = new Date(now - faker.number.int({ min: 0, max: 24 * 3600 * 1000 }));
  const toolInput =
    tool === "delete_user_record"
      ? { id: `usr_${faker.string.alphanumeric(8)}` }
      : { table: faker.helpers.arrayElement(["users", "orders", "transactions", "inventory"]) };
  return {
    agentName: "demo-agent-01",
    toolName: tool,
    toolInput,
    status: "AUTO_BLOCKED",
    reasoning: pickReasoning(tool),
    createdAt,
    decidedAt: new Date(createdAt.getTime() + faker.number.int({ min: 20, max: 400 })),
  };
}

function generateFakeRequests(count: number): FakeRequest[] {
  const now = Date.now();
  const requests: FakeRequest[] = [];
  for (let i = 0; i < count; i++) {
    const roll = faker.number.float({ min: 0, max: 1 });
    if (roll < 0.5) requests.push(makeReadRequest(now));
    else if (roll < 0.7) requests.push(makeTransferRequest(now));
    else if (roll < 0.85) requests.push(makePiiRequest(now));
    else requests.push(makeDestructiveRequest(now));
  }
  // Newest first for the dashboard feed.
  return requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function auditEventsFor(req: FakeRequest, policyName: string): { event: string; detail: Record<string, unknown>; createdAt: Date }[] {
  const events: { event: string; detail: Record<string, unknown>; createdAt: Date }[] = [
    {
      event: "REQUEST_RECEIVED",
      detail: { agentName: req.agentName, toolName: req.toolName, toolInput: req.toolInput },
      createdAt: req.createdAt,
    },
    {
      event: "POLICY_EVALUATED",
      detail: { matchedPolicy: policyName },
      createdAt: new Date(req.createdAt.getTime() + 5),
    },
  ];

  switch (req.status) {
    case "AUTO_ALLOWED":
      events.push({
        event: "EXECUTED",
        detail: { result: req.result },
        createdAt: new Date(req.createdAt.getTime() + 10),
      });
      break;
    case "AUTO_BLOCKED":
      events.push({
        event: "BLOCKED",
        detail: { policy: policyName, reason: "Destructive operation blocked by policy" },
        createdAt: new Date(req.createdAt.getTime() + 10),
      });
      break;
    case "APPROVED":
      events.push(
        {
          event: "APPROVED",
          detail: { decidedBy: "admin" },
          createdAt: req.decidedAt ?? new Date(req.createdAt.getTime() + 5000),
        },
        {
          event: "EXECUTED",
          detail: { result: req.result },
          createdAt: new Date((req.decidedAt ?? req.createdAt).getTime() + 10),
        },
      );
      break;
    case "REJECTED":
      events.push({
        event: "REJECTED",
        detail: { decidedBy: "admin", reason: "Not authorized for this operation" },
        createdAt: req.decidedAt ?? new Date(req.createdAt.getTime() + 5000),
      });
      break;
    case "PENDING":
      break; // no terminal event yet
  }
  return events;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function seedDefaultPolicies(): Promise<PolicyRule[]> {
  const seeds = defaultPolicies as unknown as PolicyRule[];
  const upserted: PolicyRule[] = [];
  for (const seed of seeds) {
    const existing = await prisma.policy.findFirst({
      where: { name: seed.name, toolPattern: seed.toolPattern },
    });
    const row = existing
      ? await prisma.policy.update({
          where: { id: existing.id },
          data: {
            description: seed.description,
            condition: seed.condition,
            action: seed.action,
            enabled: seed.enabled,
            priority: seed.priority,
          },
        })
      : await prisma.policy.create({
          data: {
            name: seed.name,
            description: seed.description,
            toolPattern: seed.toolPattern,
            condition: seed.condition,
            action: seed.action,
            enabled: seed.enabled,
            priority: seed.priority,
          },
        });
    upserted.push(row);
  }
  return upserted;
}

async function main(): Promise<void> {
  console.log("[seed] connecting to database...");
  await prisma.$connect();

  // 1. Admin user (upsert — keeps password in sync with env).
  const email = process.env.ADMIN_EMAIL ?? "admin@agentgate.dev";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`[seed] admin user ready: ${email}`);

  // 2. Default policies (upsert by name+toolPattern — preserves user edits).
  const policies = await seedDefaultPolicies();
  console.log(`[seed] ${policies.length} default policies ready`);

  // 3. Fake historical requests + audit trail (idempotent — clear first).
  await prisma.toolCallRequest.deleteMany();
  await prisma.auditLog.deleteMany();

  const fakeRequests = generateFakeRequests(60);
  const created = await prisma.toolCallRequest.createManyAndReturn({
    data: fakeRequests.map((r) => {
      // Resolve the matched policy through the real engine so historical
      // data is always consistent with the current rules.
      const decision = evaluatePolicy(policies, r.toolName, r.toolInput);
      return {
        agentName: r.agentName,
        toolName: r.toolName,
        toolInput: r.toolInput,
        status: r.status,
        reasoning: r.reasoning,
        result: r.result,
        matchedPolicyId: decision.matchedPolicyId ?? null,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      };
    }),
  });

  // createManyAndReturn preserves insertion order — zip by index.
  const auditRows = created.flatMap((row, i) => {
    const fake = fakeRequests[i];
    if (!fake) return [];
    const decision = evaluatePolicy(policies, fake.toolName, fake.toolInput);
    return auditEventsFor(fake, decision.matchedPolicyName ?? "Default catch-all").map((e) => ({
      requestId: row.id,
      event: e.event,
      detail: e.detail,
      createdAt: e.createdAt,
    }));
  });
  await prisma.auditLog.createMany({ data: auditRows });

  const statusCounts = created.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[seed] seeded ${created.length} historical requests + ${auditRows.length} audit events`);
  console.log(`[seed] status mix: ${JSON.stringify(statusCounts)}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});