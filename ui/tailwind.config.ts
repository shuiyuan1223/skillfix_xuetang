import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./src/**/*.ts", "./index.html"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // Theme-aware colors via CSS variables
        bg: {
          DEFAULT: "var(--color-bg)",
          secondary: "var(--color-bg-secondary)",
          tertiary: "var(--color-bg-tertiary)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          hover: "var(--color-surface-hover)",
          card: "var(--color-surface-card)",
          elevated: "var(--color-surface-elevated)",
          code: "var(--color-surface-code)",
          "inline-code": "var(--color-surface-inline-code)",
        },
        overlay: "var(--color-overlay)",
        "gauge-track": "var(--color-gauge-track)",
        border: {
          DEFAULT: "var(--color-border)",
          hover: "var(--color-border-hover)",
        },
        text: {
          DEFAULT: "var(--color-text)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
        },
        accent: "var(--color-accent)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        info: "var(--color-info)",
      },
      animation: {
        "card-entrance": "cardEntrance 0.5s ease-out backwards",
        "fade-in": "fadeIn 0.3s ease",
        "bounce-dot": "bounceDot 1.4s infinite",
        "bar-grow": "barGrow 0.6s ease-out backwards",
        "draw-line": "drawLine 1.5s ease-out forwards",
        "status-pulse": "statusPulse 1.5s ease-in-out infinite",
        "skeleton-shimmer": "skeletonShimmer 1.5s infinite",
        "toast-slide-in": "toastSlideIn 0.4s ease-out",
        "ring-draw": "ringDraw 1s ease-out forwards",
      },
      keyframes: {
        cardEntrance: {
          from: { opacity: "0", transform: "translateY(20px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
        barGrow: {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        drawLine: {
          to: { strokeDashoffset: "0" },
        },
        statusPulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        skeletonShimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        toastSlideIn: {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        ringDraw: {
          from: { strokeDashoffset: "var(--circumference)" },
        },
      },
    },
  },
  plugins: [forms({ strategy: "class" })],
} satisfies Config;
