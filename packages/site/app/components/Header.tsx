import { Link } from "@remix-run/react";
import { twMerge } from "tailwind-merge";
import { League } from "~/types/league";

const LeagueLink: React.FC<{ league: League; name: string }> = ({
  league,
  name,
}) => {
  return (
    <Link to={`/league/${league}`} className="flex">
      <img
        src={`/logos/${league}.svg`}
        className="w-8 sm:w-6 my-auto mr-1"
        alt={`${name} Logo`}
      />
      <p
        className={twMerge(
          league === "pwhl" ? "font-pwhl font-bold" : "",
          "hidden sm:block",
        )}
      >
        {name}
      </p>
    </Link>
  );
};

export const Header: React.FC<{ league?: League }> = ({ league }) => {
  return (
    <div className="rounded-xl p-2 pr-4 shadow-lg bg-[#553788] text-slate-50 flex">
      <Link to="/" className="w-fit shrink-0">
        <img src="/logos/logo.svg" className="h-10 rounded-xl" alt="Logo" />
      </Link>
      {/* <div className="ml-auto my-auto">
        <LeagueLink league="pwhl" name="PWHL" />
      </div> */}
    </div>
  );
};
