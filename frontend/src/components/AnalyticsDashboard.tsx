import { useState, useEffect } from "react";
import {
  TrendingUp, ShoppingCart, Truck, FileText, CreditCard,
  DollarSign, Users, Package, X, RefreshCw,
} from "lucide-react";
import { getAnalytics } from "../services/api";
import { Spinner } from "./ui";
import type { AnalyticsData } from "../types";

interface Props {
  onClose: () => void;
}

export default function AnalyticsDashboard({ onClose }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getAnalytics()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const fmtNum = (n: number) => n.toLocaleString();
  const fmtCurrency = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  const funnelSteps = [
    { label: "Orders", value: data.funnel.orders, icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Delivered", value: data.funnel.delivered, icon: Truck, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Billed", value: data.funnel.billed, icon: FileText, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Paid", value: data.funnel.paid, icon: CreditCard, color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-900/20" },
  ];

  const maxTrendRevenue = Math.max(...data.monthlyTrend.map((m) => m.revenue), 1);

  return (
    <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-500" />
          <h2 className="font-bold text-gray-900 dark:text-gray-100">O2C Analytics Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-500">
            <RefreshCw size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-500">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Total Revenue Hero */}
        <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 opacity-80 text-sm mb-1">
            <DollarSign size={16} /> Total Revenue
          </div>
          <p className="text-4xl font-bold">{fmtCurrency(data.totalRevenue)}</p>
          <p className="text-sm opacity-70 mt-1">from non-cancelled billing documents</p>
        </div>

        {/* O2C Funnel */}
        <div>
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">O2C Funnel</h3>
          <div className="grid grid-cols-4 gap-3">
            {funnelSteps.map((step, i) => {
              const pct = i > 0 && funnelSteps[0].value > 0
                ? ((step.value / funnelSteps[0].value) * 100).toFixed(0)
                : "100";
              return (
                <div key={step.label} className={`${step.bg} rounded-xl p-4 border border-gray-100 dark:border-gray-800`}>
                  <div className="flex items-center gap-2 mb-2">
                    <step.icon size={16} className={step.color} />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{step.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtNum(step.value)}</p>
                  {i > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{pct}% of orders</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-column: Top Customers + Top Products */}
        <div className="grid grid-cols-2 gap-4">
          {/* Customers */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Customers</h3>
            </div>
            <div className="space-y-2">
              {data.topCustomers.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 w-4">{i + 1}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{c.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{fmtCurrency(c.revenue)}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">{c.orders} orders</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Products */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-cyan-500" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Products</h3>
            </div>
            <div className="space-y-2">
              {data.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 w-4">{i + 1}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{p.orders} orders</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Trend */}
        {data.monthlyTrend.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Monthly Revenue Trend</h3>
            <div className="flex items-end gap-1 h-32">
              {data.monthlyTrend.map((m) => {
                const pct = (m.revenue / maxTrendRevenue) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full bg-brand-500/80 dark:bg-brand-400/60 rounded-t-sm min-h-[2px] transition-all hover:bg-brand-600 dark:hover:bg-brand-400"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="text-[8px] text-gray-400 rotate-45 origin-left whitespace-nowrap">
                      {m.month}
                    </span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                      {fmtCurrency(m.revenue)} · {m.invoices} invoices
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Status Distribution */}
        {data.statusDistribution.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Order Delivery Status</h3>
            <div className="flex gap-3">
              {data.statusDistribution.map((s) => {
                const statusLabels: Record<string, string> = { "": "Not Started", "A": "Not Delivered", "B": "Partially", "C": "Fully Delivered" };
                return (
                  <div key={s.status} className="flex-1 text-center py-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{fmtNum(s.count)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {statusLabels[s.status] || s.status}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
