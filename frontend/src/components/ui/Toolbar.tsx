import type { ReactNode } from "react";

interface ToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function Toolbar({ left, right, className = "" }: ToolbarProps) {
  return (
    <header
      className={[
        "flex items-center justify-between px-5 py-2.5",
        "bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/60",
        "shadow-sm flex-shrink-0 z-20",
        className,
      ].join(" ")}
    >
      {left && <div className="flex items-center gap-3">{left}</div>}
      {right && <div className="flex items-center gap-4 text-xs">{right}</div>}
    </header>
  );
}
