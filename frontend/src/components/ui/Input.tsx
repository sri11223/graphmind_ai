import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";

/* ── Shared base styles ────────────────────────────── */

const inputBase =
  "w-full rounded-lg border border-gray-200 dark:border-gray-600 " +
  "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 " +
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm " +
  "outline-none transition " +
  "focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";

/* ── Input ─────────────────────────────────────────── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className = "", ...props }, ref) => (
    <div className="relative">
      {icon && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={`${inputBase} px-3 py-2 ${icon ? "pl-8" : ""} ${className}`}
        {...props}
      />
    </div>
  )
);
Input.displayName = "Input";

/* ── TextArea ──────────────────────────────────────── */

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`${inputBase} px-3 py-2 resize-none ${className}`}
      {...props}
    />
  )
);
TextArea.displayName = "TextArea";
