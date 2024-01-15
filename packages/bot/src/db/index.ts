import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getDb = (db: D1Database) => drizzle(db, { schema });
