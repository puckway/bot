import type { MetaFunction } from "@remix-run/cloudflare";
import { Link, useSearchParams } from "@remix-run/react";
import { Header } from "~/components/Header";

export const meta: MetaFunction = () => {
  return [{ title: "Scores - Puckway" }];
};

export default function Scores() {
  const [params, setParams] = useSearchParams();

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 transition-[padding]">
      <Header />
      <div className="mt-6 space-y-4 font-pwhl">x</div>
    </div>
  );
}
