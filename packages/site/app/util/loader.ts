import type {
  ActionFunctionArgs as RRActionFunctionArgs,
  LoaderFunctionArgs as RRLoaderFunctionArgs,
} from "@remix-run/router";

export interface Env {
  D1: D1Database;
  KV: KVNamespace;
  __STATIC_CONTENT: Fetcher;
}

export interface Context {
  origin: string;
  env: Env;
}

// We are specifically using these imports from @remix-run/router because the
// adapter exports are not generic and we cannot pass Env like this.
export type LoaderArgs = RRLoaderFunctionArgs<Context> & { context: Context };
export type ActionArgs = RRActionFunctionArgs<Context> & { context: Context };
