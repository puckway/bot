import type { MetaFunction } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";
import { Header } from "~/components/Header";

export const meta: MetaFunction = () => {
  return [
    { title: "Puckway" },
    { name: "description", content: "Watch time. Saved." },
    { name: "theme-color", content: "#553788" },
    { property: "og:image", content: "https://puckway.shay.cat/logos/512.png" },
  ];
};

export default function Index() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 transition-[padding]">
      <Header />
      <div className="mt-6 space-y-4 font-pwhl">
        <div className="">
          <h1 className="font-bold uppercase text-5xl text-slate-900 dark:text-slate-200">
            Puckway
          </h1>
          <p className="text-lg">
            Watch time. Saved. Now in your Discord server.
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 text-slate-100 dark:bg-slate-800 p-4 shadow-lg flex">
          <div className="w-1/2 mr-4 hidden sm:block">
            <img src="/preview-threads.png" className="rounded-xl" alt="" />
          </div>
          <div className="w-full sm:w-2/3">
            <h1 className="font-bold uppercase text-3xl">Features</h1>
            <ul className="list-disc list-inside">
              <li>Live score updates in a designated channel</li>
              <li>Gameday threads</li>
              <li>Commands for game schedules and player info</li>
              <li>Partial French support</li>
            </ul>
          </div>
        </div>
        <div className="flex uppercase font-bold text-slate-200">
          {/* <Link
            to="/scores"
            className="rounded-xl bg-pwhl-tor p-2 shadow-lg text-center w-1/2 mr-2"
          >
            Scores
          </Link> */}
          <Link
            to="/invite"
            className="rounded-xl bg-pwhl-ny p-2 shadow-lg text-center w-full"
          >
            Invite bot
          </Link>
        </div>
      </div>
    </div>
  );
}
