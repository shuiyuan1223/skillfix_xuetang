/**
 * StarBorder - Animated gradient border effect
 * Adapted from React Bits (https://reactbits.dev)
 * License: MIT
 */

interface StarBorderProps {
  as?: React.ElementType;
  className?: string;
  color?: string;
  speed?: string;
  thickness?: number;
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function StarBorder({
  as: Component = 'div',
  className = '',
  color = 'rgb(var(--color-primary))',
  speed = '6s',
  thickness = 1,
  children,
  ...rest
}: StarBorderProps) {
  return (
    <Component
      className={`star-border-container ${className}`}
      style={{ padding: `${thickness}px 0`, ...rest.style }}
      {...rest}
    >
      <div
        className="border-gradient-bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="border-gradient-top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div className="star-border-inner">{children}</div>
    </Component>
  );
}
