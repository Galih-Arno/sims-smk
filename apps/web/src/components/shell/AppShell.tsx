import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Outlet } from "react-router-dom";
import type { AcademicPeriodDto } from "@sims/shared";
import { jobTitle } from "../../lib/access.ts";
import { api } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { PortalProvider, usePortal } from "../../lib/portal.tsx";
import { SchoolProvider, useSchoolScope } from "../../lib/school.tsx";
import { crumbsFor } from "./crumbs.ts";
import { Sidebar } from "./Sidebar.tsx";

function ShellFrame() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { schools, schoolId, school, setSchoolId, loading } = useSchoolScope();
  const { portal } = usePortal();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem("sims.sidebarCollapsed") === "1");
  const [loggingOut, setLoggingOut] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const title = jobTitle(user, schoolId, portal);
  const crumbs = crumbsFor(location.pathname);

  useEffect(() => {
    if (!schoolId) {
      setPeriodName("");
      return;
    }
    let active = true;
    api<{ academicPeriods: AcademicPeriodDto[] }>(`/api/v1/schools/${schoolId}/academic-periods`)
      .then((data) => {
        if (!active) return;
        setPeriodName(data.academicPeriods.find((period) => period.isActive)?.name ?? "Belum ada semester aktif");
      })
      .catch(() => {
        if (active) setPeriodName("");
      });
    return () => {
      active = false;
    };
  }, [schoolId]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      sessionStorage.setItem("sims.sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {mobileOpen ? <button type="button" aria-label="Tutup menu" className="app-chrome fixed inset-0 z-30 bg-slate-950/50 md:hidden" onClick={() => setMobileOpen(false)} /> : null}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        onExpand={() => {
          setCollapsed(false);
          sessionStorage.setItem("sims.sidebarCollapsed", "0");
        }}
      />
      <div className={`app-frame flex h-dvh min-w-0 flex-col overflow-hidden transition-[padding] duration-200 ${collapsed ? "md:pl-20" : "md:pl-64"}`}>
        <header className="app-chrome sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-3 text-sm font-medium md:hidden" onClick={() => setMobileOpen(true)}>
              Menu
            </button>
            <button type="button" className="hidden min-h-11 items-center rounded-xl border border-slate-300 px-3 text-sm font-medium md:inline-flex" onClick={toggleCollapsed}>
              {collapsed ? "Buka menu" : "Ciutkan"}
            </button>
            <div className="min-w-0 flex-1">
              {schools.length > 1 ? (
                <label className="block text-xs font-medium text-slate-500">
                  Sekolah aktif
                  <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="mt-0.5 block w-full max-w-xs truncate rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900">
                    {schools.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}{item.accessStatus === "AKTIF" ? "" : ` · ${item.accessStatus === "DITANGGUHKAN" ? "Ditangguhkan" : "Nonaktif"}`}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="truncate text-sm font-semibold text-slate-900">{loading ? "Memuat sekolah..." : schools[0]?.name ?? "Belum ada sekolah"}</p>
              )}
              {periodName ? <p className="truncate text-xs text-slate-500">Semester aktif: {periodName}</p> : null}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-950">{user?.name.slice(0, 1).toUpperCase()}</span>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{title}</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-3 text-sm font-medium"
                disabled={loggingOut}
                onClick={() => {
                  setLoggingOut(true);
                  void logout().finally(() => setLoggingOut(false));
                }}
              >
                {loggingOut ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </div>
        </header>
        <div className="app-scroll relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4">
          <nav aria-label="Jejak halaman" className="app-chrome mb-3 flex min-w-0 flex-wrap items-center gap-1 text-sm text-slate-500">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.to ? <Link to={crumb.to} className="truncate font-medium text-teal-800">{crumb.label}</Link> : <span className="truncate font-medium text-slate-800">{crumb.label}</span>}
              </span>
            ))}
          </nav>
          {school && school.accessStatus !== "AKTIF" ? (
            <p role="status" className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Sekolah ini {school.accessStatus === "DITANGGUHKAN" ? "ditangguhkan" : "nonaktif"}. Operasi sekolah ditolak sampai pemilik sistem mengaktifkannya kembali.
            </p>
          ) : null}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <SchoolProvider>
      <PortalProvider>
        <ShellFrame />
      </PortalProvider>
    </SchoolProvider>
  );
}
