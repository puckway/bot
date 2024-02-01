import type { MetaFunction } from "@remix-run/cloudflare";
import { Header } from "~/components/Header";

export const meta: MetaFunction = () => {
  return [
    { title: "Docs - Puckway" },
    { name: "theme-color", content: "#553788" },
    { property: "og:image", content: "https://puckway.shay.cat/logos/512.png" },
  ];
};

export default function Index() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 transition-[padding]">
      <Header />
      <div className="mt-6">
        <h1 className="font-bold text-3xl mb-1">Privacy Policy</h1>
        <p>
          Puckway stores some data as necessary for functionality. Configuring
          notifications with <span className="font-bold">/notifications</span>{" "}
          will cause submitted data to be saved permanently.
        </p>
        <h1 className="font-bold text-3xl mt-4 mb-1">Terms of Use</h1>
        <p>
          Don't attempt to cause Puckway to create spam against the Discord API
          or any other service used by the bot. Use only as directed. Batteries
          not included.
        </p>
      </div>
    </div>
  );
}
