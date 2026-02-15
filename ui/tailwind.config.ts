import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import animate from "tailwindcss-animate";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // Opaque colors: space-separated RGB + <alpha-value> for opacity modifier support
        bg: {
          DEFAULT: "rgb(var(--color-bg) / <alpha-value>)",
          secondary: "rgb(var(--color-bg-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--color-bg-tertiary) / <alpha-value>)",
        },
        // Semi-transparent colors: keep as-is (no opacity modifier)
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
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          hover: "rgb(var(--color-border-hover) / <alpha-value>)",
        },
        // Opaque colors: space-separated RGB + <alpha-value>
        text: {
          DEFAULT: "rgb(var(--color-text) / <alpha-value>)",
          secondary: "rgb(var(--color-text-secondary) / <alpha-value>)",
          muted: "rgb(var(--color-text-muted) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-fg) / <alpha-value>)",
        },
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
      },
      // Motion Design Tokens
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
        slower: "600ms",
      },
      transitionTimingFunction: {
        "ease-out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      animation: {
        "card-entrance": "cardEntrance 0.5s ease-out backwards",
        "fade-in": "fadeIn 0.3s ease",
        "bounce-dot": "bounceDot 1.4s infinite",
        "draw-line": "drawLine 1.5s ease-out forwards",
        "status-pulse": "statusPulse 1.5s ease-in-out infinite",
        "skeleton-shimmer": "skeletonShimmer 1.5s infinite",
        "toast-slide-in": "toastSlideIn 0.4s ease-out",
        "ring-draw": "ringDraw 1s ease-out forwards",
        "radar-expand": "radarExpand 0.6s ease-out forwards",
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
        radarExpand: {
          from: { opacity: "0", transform: "scale(0.3)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [forms({ strategy: "class" }), animate],
} satisfies Config;
