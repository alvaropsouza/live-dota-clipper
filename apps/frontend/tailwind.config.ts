import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:             "var(--bg)",
        surface:        "var(--surface)",
        "surface-2":    "var(--surface-2)",
        border:         "var(--border)",
        ink:            "var(--ink)",
        muted:          "var(--muted)",
        dim:            "var(--dim)",
        primary:        "var(--primary)",
        "primary-muted":"var(--primary-muted)",
        "primary-fg":   "var(--primary-fg)",
        accent:         "var(--accent)",
        "accent-muted": "var(--accent-muted)",
        "accent-fg":    "var(--accent-fg)",
        error:          "var(--error)",
        "error-muted":  "var(--error-muted)",
        "error-fg":     "var(--error-fg)",
      },
    },
  },
  plugins: [],
} satisfies Config
