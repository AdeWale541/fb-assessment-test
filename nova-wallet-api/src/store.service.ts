import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";
import { Db } from "./types";

function emptyDb(): Db {
  return { wallets: {}, transfers: [], idempotencyKeys: {} };
}

/**
 * Serializes all read-modify-write operations against the DB so that
 * concurrent requests (e.g. two transfers hitting the same wallet) can't
 * interleave and corrupt balances. Since this is a single-process JSON-file
 * store, a simple in-process promise-chain mutex is sufficient to guarantee
 * atomicity - no external lock manager needed. This guarantees atomicity
 * within one Node process; it would not survive horizontal scaling without
 * moving the lock to Redis/Postgres advisory locks.
 */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

@Injectable()
export class StoreService {
  private readonly dbPath = path.join(__dirname, "..", "data", "db.json");
  private readonly mutex = new Mutex();
  private db: Db;

  constructor() {
    this.db = this.load();
  }

  private load(): Db {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify(emptyDb(), null, 2));
    }
    const raw = fs.readFileSync(this.dbPath, "utf-8");
    return JSON.parse(raw) as Db;
  }

  // Write-then-rename keeps db.json from ever being left half-written if the
  // process is killed mid-save.
  private persist(): void {
    const tmpPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmpPath, this.dbPath);
  }

  /**
   * Runs `fn` with exclusive access to the DB. If `fn` throws, no changes are
   * persisted (the in-memory copy is mutated directly, so callers should only
   * mutate after validation has already passed).
   */
  withDb<T>(fn: (db: Db) => T): Promise<T> {
    return this.mutex.run(() => {
      const result = fn(this.db);
      this.persist();
      return result;
    });
  }

  readDb(): Db {
    return this.db;
  }
}
