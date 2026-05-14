// viewer/tailwind.config.ts
// Generated for B.CAVE Competitor Radar handoff.
// All colors resolve to CSS variables defined in app/globals.css (copied
// from design-reference/tokens.css). This bridge gives us Tailwind class
// names without duplicating values.

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:   "var(--bg-canvas)",
        surface:  "var(--bg-surface)",
        raised:   "var(--bg-raised)",
        sunken:   "var(--bg-sunken)",
        hover:    "var(--bg-hover)",
        active:   "var(--bg-active)",
        selected: "var(--bg-selected)",

        border: {
          DEFAULT: "var(--border-default)",
          hair:    "var(--border-hair)",
          subtle:  "var(--border-subtle)",
          strong:  "var(--border-strong)",
          focus:   "var(--border-focus)",
        },

        fg: {
          DEFAULT:    "var(--fg-secondary)",
          primary:    "var(--fg-primary)",
          secondary:  "var(--fg-secondary)",
          tertiary:   "var(--fg-tertiary)",
          quaternary: "var(--fg-quaternary)",
          disabled:   "var(--fg-disabled)",
          inverse:    "var(--fg-inverse)",
        },

        sev: {
          high:  { bg: "var(--sev-high-bg)",  border: "var(--sev-high-border)",  fg: "var(--sev-high-fg)",  solid: "var(--sev-high-solid)"  },
          med:   { bg: "var(--sev-med-bg)",   border: "var(--sev-med-border)",   fg: "var(--sev-med-fg)",   solid: "var(--sev-med-solid)"   },
          low:   { bg: "var(--sev-low-bg)",   border: "var(--sev-low-border)",   fg: "var(--sev-low-fg)",   solid: "var(--sev-low-solid)"   },
        },

        trend: {
          up:   "var(--trend-up)",
          down: "var(--trend-down)",
          flat: "var(--trend-flat)",
        },

        chart: {
          1: "var(--chart-1)", 2: "var(--chart-2)", 3: "var(--chart-3)",
          4: "var(--chart-4)", 5: "var(--chart-5)", 6: "var(--chart-6)",
          grid: "var(--chart-grid)", axis: "var(--chart-axis)", tick: "var(--chart-tick)",
        },

        heat: {
          0: "var(--heat-0)", 1: "var(--heat-1)", 2: "var(--heat-2)",
          3: "var(--heat-3)", 4: "var(--heat-4)", 5: "var(--heat-5)",
        },

        house:     "var(--house)",
        "house-soft": "var(--house-soft)",
      },

      fontFamily: {
        sans: ['"Pretendard Variable"', "Pretendard", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },

      fontSize: {
        "2xs": ["10px", "14px"],
        xs:    ["11px", "16px"],
        sm:    ["12px", "16px"],
        base:  ["13px", "19px"],
        md:    ["14px", "20px"],
        lg:    ["16px", "22px"],
        xl:    ["18px", "26px"],
        "2xl": ["20px", "26px"],
        "3xl": ["24px", "30px"],
        "4xl": ["32px", "38px"],
      },

      letterSpacing: {
        tight:   "-0.012em",
        display: "-0.025em",
        wide:    "0.06em",
        num:     "-0.005em",
      },

      // Custom spacing scale matching --sp-* tokens.
      // We deliberately override Tailwind's defaults to keep parity with the mocks.
      spacing: {
        "0.5": "2px",  "1":   "4px",  "1.5": "6px",  "2":   "8px",
        "3":   "12px", "4":   "16px", "5":   "20px", "6":   "24px",
        "8":   "32px", "10":  "40px", "14":  "56px", "18":  "72px", "26":  "104px",
      },

      borderRadius: {
        xs: "1px", sm: "3px",
        DEFAULT: "5px", md: "5px",
        lg: "7px", xl: "12px",
      },

      boxShadow: {
        xs:  "var(--shadow-xs)",
        sm:  "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md:  "var(--shadow-md)",
        lg:  "var(--shadow-lg)",
        xl:  "var(--shadow-xl)",
      },

      keyframes: {
        pulse: {
          "0%":   { boxShadow: "0 0 0 0 color-mix(in oklch, var(--house-soft) 50%, transparent)" },
          "70%":  { boxShadow: "0 0 0 6px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        shimmer: { to: { backgroundPosition: "-200% 0" } },
        spin:    { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        pulse:   "pulse 2.4s ease-out infinite",
        shimmer: "shimmer 1.2s ease-in-out infinite",
        spin:    "spin 700ms linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
