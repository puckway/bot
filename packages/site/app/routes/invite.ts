import { redirect } from "@remix-run/cloudflare";

export const loader = () =>
  redirect(
    "https://discord.com/oauth2/authorize?client_id=1191423677397475428&scope=bot&permissions=60129987584",
  );
