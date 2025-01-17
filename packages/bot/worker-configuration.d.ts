interface Env {
  DB: D1Database;
  KV: KVNamespace;
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
  NOTIFICATIONS: DurableObjectNamespace;
  MONTHLY_SKU?: string;
  LIFETIME_SKU?: string;
  KHL?: Fetcher;
}
