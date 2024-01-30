import type { Config } from "tailwindcss";

export default ({
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Roboto", "sans-serif"],
      pwhl: ["Transducer", "sans-serif"],
    },
    extend: {
      colors: {
        pwhl: {
          DEFAULT: "#2e0887",
          bos: "#244635",
          min: "#2b1b44",
          mon: "#7b2d35",
          ny: "#4fafa8",
          ott: "#982932",
          tor: "#467ddb",
        },
        khl: {
          DEFAULT: "#306da9",
        },
      },
    },
  },
  plugins: [],
} satisfies Config);
