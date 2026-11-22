import { NavLink } from "react-router-dom";
import { usePortal } from "../../lib/portal.tsx";

type QuickItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: "home" | "check" | "score" | "class" | "users" | "report";
};

const QUICK_NAV: Record<"admin" | "guru" | "wali", QuickItem[]> = {
  guru: [
    { to: "/guru/beranda", label: "Beranda", end: true, icon: "home" },
    { to: "/guru/absensi", label: "Absensi", icon: "check" },
    { to: "/guru/nilai", label: "Nilai", icon: "score" },
    { to: "/guru/kelas", label: "Kelas", icon: "class" },
  ],
  wali: [
    { to: "/wali/beranda", label: "Beranda", end: true, icon: "home" },
    { to: "/wali/absensi-harian", label: "Harian", icon: "check" },
    { to: "/wali/persiapan-rapor", label: "Rapor", icon: "report" },
    { to: "/wali/monitoring-nilai", label: "Nilai", icon: "score" },
  ],
  admin: [
    { to: "/", label: "Beranda", end: true, icon: "home" },
    { to: "/siswa", label: "Siswa", icon: "users" },
    { to: "/guru", label: "Guru", icon: "class" },
    { to: "/validasi-rapor", label: "Rapor", icon: "report" },
  ],
};

function QuickIcon({ name }: { name: QuickItem["icon"] }) {
  const cls = "h-5 w-5";
  if (name === "home") {
    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
  }
  if (name === "check") {
    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  }
  if (name === "score") {
    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19V9M12 19V5M19 19v-7" /></svg>;
  }
  if (name === "class") {
    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8 12 4l9 4-9 4zM7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" /></svg>;
  }
  if (name === "users") {
    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" /></svg>;
  }
  return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 4h8v3H8zM6 7h12v13H6zM9 12h6M9 16h4" /></svg>;
}

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { portal } = usePortal();
  const items = QUICK_NAV[portal];

  return (
    <nav
      aria-label="Navigasi cepat mobile"
      className="app-chrome fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-5 px-1 py-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-medium transition-colors ${
                isActive ? "bg-navy-950 text-gold-500 font-semibold" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <QuickIcon name={item.icon} />
            <span className="truncate max-w-full">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
