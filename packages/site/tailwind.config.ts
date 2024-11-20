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
          DEFAULT: "#6738B6",
          bos: "#223E35",
          min: "#220F5E",
          mon: "#7B2D35",
          ny: "#52B3AF",
          ott: "#982932",
          tor: "#2B65B3",
        },
        khl: {
          DEFAULT: "#306da9",
        },
      },
    },
  },
  plugins: [],
} satisfies Config);
