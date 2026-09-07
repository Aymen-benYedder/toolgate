/**
 * Test bootstrap — load the repo-root .env so Prisma finds DATABASE_URL
 * (the sqlite dev.db) in tests that touch the real interceptor pipeline.
 * Vitest runs with CWD = packages/proxy, hence the ../../ hop.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });