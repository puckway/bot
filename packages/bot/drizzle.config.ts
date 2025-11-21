import * as dotenv from "dotenv";
import type { Config } from "drizzle-kit";

dotenv.config();

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  driver: "d1",
  dbCredentials: {
    dbName: "puckway --local",
    wranglerConfigPath: "wrangler.toml",
  },
} satisfies Config;
