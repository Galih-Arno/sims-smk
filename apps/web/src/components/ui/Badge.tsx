import type { ReactNode } from "react";

const TONE = {
  ok: "bg-emerald-100 text-emerald-950",
  warn: "bg-amber-100 text-amber-950",
  muted: "bg-slate-200 text-slate-800",
  info: "bg-violet-100 text-violet-950",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}
