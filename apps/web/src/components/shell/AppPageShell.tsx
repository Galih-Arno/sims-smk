import type { ReactNode } from "react";

type AppPageShellProps = {
  title: string;
  subtitle?: ReactNode;
  badge?: string;
  rightSlot?: ReactNode;
  tabsSlot?: ReactNode;
  bannerSlot?: ReactNode;
  children: ReactNode;
  flushBody?: boolean;
};

export function AppPageShell({
  title,
  subtitle,
  badge,
  rightSlot,
  tabsSlot,
  bannerSlot,
  children,
  flushBody = false,
}: AppPageShellProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-xs sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {badge ? (
              <span className="inline-block rounded-full bg-[#0D1B4C]/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#0D1B4C] uppercase">
                {badge}
              </span>
            ) : null}
            <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-5 text-slate-600 sm:text-[13px]">{subtitle}</p>
            ) : null}
          </div>
          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </div>
        {bannerSlot ? <div className="mt-2.5">{bannerSlot}</div> : null}
        {tabsSlot ? <div className="mt-3 border-t border-slate-100 pt-2.5">{tabsSlot}</div> : null}
      </div>

      <div
        className={
          flushBody
            ? "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs"
            : "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
        }
      >
        {children}
      </div>
    </section>
  );
}

type AppModalProps = {
  open: boolean;
  labelledBy?: string;
  children: ReactNode;
};

export function AppModal({ open, labelledBy = "app-modal-title", children }: AppModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 px-4 pb-24 pt-6 backdrop-blur-[1px] sm:items-center sm:pb-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
