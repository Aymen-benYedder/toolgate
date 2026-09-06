import "dotenv/config";
import { prisma } from "../src/db/client.js";

/**
 * Seed script — full implementation lands in AG-2 (mock DB + fake history)
 * and AG-3 (default policies). For now: verify connectivity + report counts.
 */
async function main(): Promise<void> {
  console.log("[seed] connecting to database...");
  await prisma.$connect();

  const [policies, admins, requests] = await Promise.all([
    prisma.policy.count(),
    prisma.adminUser.count(),
    prisma.toolCallRequest.count(),
  ]);

  console.log(`[seed] connected. policies=${policies} admins=${admins} requests=${requests}`);
  console.log("[seed] full seeding (default policies + fake audit history) lands in AG-2/AG-3");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});