import { faker } from "@faker-js/faker";

/**
 * Mock company database ("Northwind Retail") — the sandboxed fake DB that
 * agent tool calls execute against. In-memory by design: it is a demo-only
 * sandbox, re-seeded on boot and on demo reset. Never touches real systems.
 *
 * Spec §9.1: users (with PII flags on email/phone), orders, transactions
 * (with amount), inventory — ~30-50 fake rows via @faker-js/faker.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface MockUser {
  id: string;
  name: string;
  /** PII — flagged in the dashboard as sensitive. */
  email: string;
  /** PII — flagged in the dashboard as sensitive. */
  phone: string;
  role: "admin" | "staff" | "customer";
  active: boolean;
  createdAt: Date;
}

export interface MockOrder {
  id: string;
  userId: string;
  status: "pending" | "shipped" | "delivered" | "cancelled";
  total: number;
  itemCount: number;
  createdAt: Date;
}

export interface MockTransaction {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  type: "transfer" | "payment" | "refund";
  status: "completed" | "pending" | "failed";
  createdAt: Date;
}

export interface MockInventoryItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  reorderLevel: number;
}

export type MockTableName = "users" | "orders" | "transactions" | "inventory";

// ── Mock DB ────────────────────────────────────────────────────────────────

export class MockDb {
  users: MockUser[] = [];
  orders: MockOrder[] = [];
  transactions: MockTransaction[] = [];
  inventory: MockInventoryItem[] = [];

  /** Deterministic seed — the same "Northwind Retail" appears on every boot. */
  seed(): void {
    faker.seed(42);
    this.users = [];
    this.orders = [];
    this.transactions = [];
    this.inventory = [];

    // Users (~20) — mostly customers, a few staff/admin, some inactive.
    for (let i = 0; i < 20; i++) {
      this.users.push({
        id: `usr_${faker.string.alphanumeric(8)}`,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        role: faker.helpers.arrayElement([
          "customer",
          "customer",
          "customer",
          "staff",
          "admin",
        ] as const),
        active: faker.datatype.boolean({ probability: 0.85 }),
        createdAt: faker.date.past({ years: 2 }),
      });
    }

    // Orders (~25) — linked to users, realistic status mix.
    for (let i = 0; i < 25; i++) {
      const user = faker.helpers.arrayElement(this.users);
      this.orders.push({
        id: `ord_${faker.string.alphanumeric(8)}`,
        userId: user.id,
        status: faker.helpers.arrayElement([
          "pending",
          "shipped",
          "delivered",
          "delivered",
          "cancelled",
        ] as const),
        total: faker.number.float({ min: 5, max: 2000, fractionDigits: 2 }),
        itemCount: faker.number.int({ min: 1, max: 12 }),
        createdAt: faker.date.recent({ days: 90 }),
      });
    }

    // Transactions (~15) — the `amount` field drives the "large transfer" policy.
    for (let i = 0; i < 15; i++) {
      this.transactions.push({
        id: `txn_${faker.string.alphanumeric(8)}`,
        fromAccount: faker.finance.accountNumber(8),
        toAccount: faker.finance.accountNumber(8),
        amount: faker.number.float({ min: 1, max: 5000, fractionDigits: 2 }),
        type: faker.helpers.arrayElement(["transfer", "payment", "refund"] as const),
        status: faker.helpers.arrayElement([
          "completed",
          "completed",
          "pending",
          "failed",
        ] as const),
        createdAt: faker.date.recent({ days: 30 }),
      });
    }

    // Inventory (~12).
    for (let i = 0; i < 12; i++) {
      this.inventory.push({
        id: `inv_${faker.string.alphanumeric(8)}`,
        sku: `${faker.string.alpha({ length: 4, casing: "upper" })}-${faker.string.numeric(4)}`,
        name: faker.commerce.productName(),
        quantity: faker.number.int({ min: 0, max: 500 }),
        price: faker.number.float({ min: 1, max: 500, fractionDigits: 2 }),
        reorderLevel: faker.number.int({ min: 5, max: 50 }),
      });
    }
  }

  // ── Tool operations (called by the interceptor / demo generator) ─────────

  getUser(id: string): MockUser | null {
    return this.users.find((u) => u.id === id) ?? null;
  }

  listOrders(userId?: string): MockOrder[] {
    return userId ? this.orders.filter((o) => o.userId === userId) : this.orders;
  }

  readInventory(sku?: string): MockInventoryItem[] {
    return sku ? this.inventory.filter((i) => i.sku === sku) : this.inventory;
  }

  /** Sensitive — returns the full user record including PII fields. */
  readUserPii(id: string): MockUser | null {
    return this.getUser(id);
  }

  transferFunds(from: string, to: string, amount: number): MockTransaction {
    const txn: MockTransaction = {
      id: `txn_${faker.string.alphanumeric(8)}`,
      fromAccount: from,
      toAccount: to,
      amount,
      type: "transfer",
      status: "completed",
      createdAt: new Date(),
    };
    this.transactions.push(txn);
    return txn;
  }

  deleteUserRecord(id: string): { deleted: boolean; id: string } {
    const before = this.users.length;
    this.users = this.users.filter((u) => u.id !== id);
    return { deleted: this.users.length < before, id };
  }

  dropTable(table: string): { dropped: boolean; table: string } {
    const valid: MockTableName[] = ["users", "orders", "transactions", "inventory"];
    if (!valid.includes(table as MockTableName)) {
      return { dropped: false, table };
    }
    this[table as MockTableName] = [];
    return { dropped: true, table };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let instance: MockDb | null = null;

/** Shared by the interceptor, demo generator, and scenario scripts. */
export function getMockDb(): MockDb {
  if (!instance) {
    instance = new MockDb();
    instance.seed();
  }
  return instance;
}