import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../db.ts';
import * as schema from './drizzle-schema.ts';

// Drizzle shares the existing pg Pool. Raw pg queries can be migrated
// incrementally without creating a second database connection pool.
export const orm = drizzle({ client: pool, schema });
