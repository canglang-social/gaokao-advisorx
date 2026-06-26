import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DataSnapshot } from '../domain/types';
import { getConfig, type DbDriver } from '../config';
import { DataStore, Repository, emptySnapshot } from './repository';

/**
 * JSON-file-backed store. The default v0 driver — zero external dependencies.
 * Writes atomically (temp file + rename) so a crash mid-write can't corrupt data.
 */
export class JsonStore implements DataStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), 'data', 'store.json');
  }

  async read(): Promise<DataSnapshot> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as DataSnapshot;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return emptySnapshot();
      throw err;
    }
  }

  async write(snapshot: DataSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}

/** Ephemeral in-process store. Used by unit tests and the eval harness. */
export class MemoryStore implements DataStore {
  private snapshot: DataSnapshot;

  constructor(initial?: DataSnapshot) {
    this.snapshot = initial ?? emptySnapshot();
  }

  async read(): Promise<DataSnapshot> {
    // Return a structural clone so callers can't mutate internal state by reference.
    return structuredClone(this.snapshot);
  }

  async write(snapshot: DataSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

/**
 * Construct the configured DataStore. This is the swap point for a real DB:
 * implement `DataStore` (e.g. a PostgresStore) and wire it in here.
 */
export function createDataStore(driver?: DbDriver): DataStore {
  const d = driver ?? getConfig().dbDriver;
  switch (d) {
    case 'json':
      return new JsonStore();
    case 'memory':
      return new MemoryStore();
    case 'sqlite':
      // MOCK BOUNDARY: real SQLite/Postgres driver not implemented in v0.
      throw new Error(
        "DB_DRIVER=sqlite is not implemented in v0. See docs/MOCKS.md. Use 'json' or 'memory'.",
      );
    default:
      throw new Error(`Unknown DB_DRIVER: ${d}`);
  }
}

/** Convenience: a Repository over the configured store. */
export function createRepository(driver?: DbDriver): Repository {
  return new Repository(createDataStore(driver));
}
