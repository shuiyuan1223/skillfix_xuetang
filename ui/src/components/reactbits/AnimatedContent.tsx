/**
 * AnimatedContent - Lightweight content entrance animation
 * Inspired by React Bits (https://reactbits.dev)
 * Pure CSS animation — no React hooks to avoid dual-React issues in test env
 */

interface AnimatedContentProps {
  children: React.ReactNode;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  delay?: number;
  className?: string;
}

export default function AnimatedContent({
  children,
  distance = 50,
  direction = "vertical",
  reverse = false,
  duration = 0.6,
  delay = 0,
  className = "",
}: AnimatedContentProps) {
  const axis = direction === "horizontal" ? "translateX" : "translateY";
  const offset = reverse ? -distance : distance;

  return (
    <div
      className={`motion-safe:animate-[rb-entrance_var(--rb-dur)_cubic-bezier(0.16,1,0.3,1)_var(--rb-delay)_backwards] ${className}`}
      style={{
        "--rb-dur": `${duration}s`,
        "--rb-delay": `${delay}s`,
        "--rb-transform": `${axis}(${offset}px)`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
