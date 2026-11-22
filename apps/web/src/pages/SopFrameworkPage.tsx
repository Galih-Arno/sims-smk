import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppPageShell } from "../components/shell/AppPageShell.tsx";
import { allJobTitles, isOwner, rolesAtSchool } from "../lib/access.ts";
import { useAuth } from "../lib/auth.tsx";
import { usePortal } from "../lib/portal.tsx";
import { useSchoolScope } from "../lib/school.tsx";
import { SOP_FRAMEWORK } from "../lib/sopWorkflow.ts";

export function SopFrameworkPage() {
  const { user } = useAuth();
  const { schoolId } = useSchoolScope();
  const { teachings, homerooms } = usePortal();
  const [mode, setMode] = useState<"mine" | "all">("mine");
  const [query, setQuery] = useState("");

  const activeRoles = useMemo(() => {
    const set = new Set(rolesAtSchool(user, schoolId));
    if (teachings.length > 0) set.add("GURU_MAPEL");
    if (homerooms.length > 0) set.add("WALI_KELAS");
    return set;
  }, [user, schoolId, teachings.length, homerooms.length]);

  const owner = isOwner(user);
  const badges = useMemo(
    () => allJobTitles(user, schoolId, teachings.length > 0, homerooms.length > 0),
    [user, schoolId, teachings.length, homerooms.length]
  );

  const visibleSops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOP_FRAMEWORK.map((sop) => {
      const steps = sop.steps.map((st) => ({
        ...st,
        isMine: owner || st.roles.some((r) => activeRoles.has(r)),
      }));
      return { ...sop, steps, hasMyStep: steps.some((st) => st.isMine) };
    }).filter((sop) => {
      if (mode === "mine" && !sop.hasMyStep) return false;
      if (!q) return true;
      return (
        sop.code.toLowerCase().includes(q) ||
        sop.title.toLowerCase().includes(q) ||
        sop.domain.toLowerCase().includes(q) ||
        sop.steps.some((st) => st.actor.toLowerCase().includes(q) || st.formName.toLowerCase().includes(q))
      );
    });
  }, [mode, query, activeRoles, owner]);

  return (
    <AppPageShell
      title="Kerangka SOP & Alur Kerja Terpadu"
      subtitle="Peta estafet operasional lintas peran, lintas jurusan, & siklus siswa dari PPDB hingga Alumni."
      rightSlot={
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setMode("mine")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${mode === "mine" ? "bg-[#0D1B4C] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            SOP Tugas Saya
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${mode === "all" ? "bg-[#0D1B4C] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Semua SOP (01–08)
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-slate-500">Peran Aktif Anda:</span>
          {badges.map((b) => (
            <span key={b} className="rounded-full bg-[#0D1B4C]/8 px-3 py-1 text-xs font-bold text-[#0D1B4C]">
              {b}
            </span>
          ))}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari SOP, aktor, atau nama form..."
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#0D1B4C] focus:bg-white sm:w-64"
        />
      </div>

      <div className="space-y-4">
        {visibleSops.map((sop) => (
          <article key={sop.code} className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-xs">
            <header className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#0D1B4C] px-2.5 py-1 text-xs font-extrabold tracking-wide text-[#F5C400]">
                  {sop.code}
                </span>
                <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900">
                  {sop.domain}
                </span>
              </div>
              <h2 className="mt-2 text-base font-extrabold text-slate-900">{sop.title}</h2>
              <p className="mt-1 text-xs text-slate-600">
                <strong className="text-slate-800">Pemicu:</strong> {sop.trigger} ·{" "}
                <strong className="text-slate-800">Hasil Akhir:</strong> {sop.outcome}
              </p>
            </header>

            <div className="divide-y divide-slate-100">
              {sop.steps.map((step, i) => (
                <div
                  key={`${sop.code}-${i}`}
                  className={`flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center ${step.isMine ? "bg-amber-50/40" : ""}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-800">
                        {i + 1}
                      </span>
                      <span className="text-xs font-extrabold text-[#0D1B4C]">{step.actor}</span>
                      {step.isMine && (
                        <span className="rounded-full bg-[#F5C400]/25 px-2 py-0.5 text-[10px] font-extrabold text-[#0D1B4C]">
                          Tugas Anda
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-500">→ Estafet ke: {step.handoffTo}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700">{step.action}</p>
                    <p className="text-[11px] font-semibold text-teal-800">Form Input: {step.formName}</p>
                  </div>

                  <Link
                    to={step.actionTo}
                    className={`inline-flex shrink-0 items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      step.isMine
                        ? "bg-[#0D1B4C] text-white shadow-xs hover:bg-[#162B75]"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {step.actionLabel} →
                  </Link>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </AppPageShell>
  );
}
