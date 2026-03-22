import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

/* ── Types ───────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastCtx {
  toast: (variant: ToastVariant, message: string, duration?: number) => void;
}

/* ── Context ─────────────────────────────────────────── */

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast(): ToastCtx {
  return useContext(ToastContext);
}

/* ── Variant config ──────────────────────────────────── */

const cfg: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; bg: string; border: string; text: string }
> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-700",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-700",
    text: "text-red-800 dark:text-red-200",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-700",
    text: "text-blue-800 dark:text-blue-200",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-700",
    text: "text-amber-800 dark:text-amber-200",
  },
};

/* ── Provider ────────────────────────────────────────── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (variant: ToastVariant, message: string, duration = 4000) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, variant, message }]);
      if (duration > 0) setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const c = cfg[t.variant];
          const Icon = c.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm max-w-sm animate-slide-in ${c.bg} ${c.border}`}
            >
              <Icon size={16} className={`flex-shrink-0 mt-0.5 ${c.text}`} />
              <p className={`text-sm flex-1 ${c.text}`}>{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
