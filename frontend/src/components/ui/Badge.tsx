import type { ReactNode } from "react";

interface BadgeProps {
  color: string;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function Badge({
  color,
  children,
  size = "sm",
  className = "",
}: BadgeProps) {
  const sizeClass =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium leading-none ${sizeClass} ${className}`}
      style={{ backgroundColor: `${color}18`, color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}
