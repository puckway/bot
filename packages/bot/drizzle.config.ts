import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

export default ({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  driver: "d1",
  dbCredentials: {
    dbName: "puckway --local",
    wranglerConfigPath: "wrangler.toml",
  },
} satisfies Config);
