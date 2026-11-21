import { useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { canActivateGradePolicy, canCoordinate } from "../lib/access.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolScope } from "../lib/school.tsx";

type Kind = "PEMBELAJARAN" | "LIBUR" | "TIDAK_WAJIB";
type Day = { date: string; kind: Kind; note: string | null };
type Rule = {
  id: string;
  status: "DRAFT" | "ACTIVE";
  requiredDays: number;
  holidayDays: number;
  exemptDays: number;
  days: Day[];
};
type Payload = {
  period: { id: string; name: string; startDate: string; endDate: string } | null;
  rule: Rule | null;
};

const KIND_LABEL: Record<Kind, string> = {
  PEMBELAJARAN: "Pembelajaran",
  LIBUR: "Libur",
  TIDAK_WAJIB: "Tidak wajib absensi",
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function AttendanceCompletenessPage() {
  const { user } = useAuth();
  const { schoolId } = useSchoolScope();
  const allowed = canCoordinate(user, schoolId);
  const mayActivate = canActivateGradePolicy(user, schoolId);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<Kind>("PEMBELAJARAN");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId || !allowed) return;
    api<Payload>(`/api/v1/schools/${schoolId}/attendance-completeness`)
      .then((result) => {
        setPayload(result);
        setDays(result.rule?.days ?? []);
        setDate(result.period?.startDate ?? "");
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Pengaturan absensi gagal dimuat."));
  }, [schoolId, allowed]);

  const savedKey = useMemo(() => calendarKey(payload?.rule?.days ?? []), [payload]);
  const dirty = calendarKey(days) !== savedKey;
  const requiredDays = days.filter((day) => day.kind === "PEMBELAJARAN").length;
  const period = payload?.period ?? null;
  const status = payload?.rule?.status ?? null;
  const locked = status === "ACTIVE" && !mayActivate;

  function assignDay() {
    if (!period || !date) return;
    if (date < period.startDate || date > period.endDate) {
      setMessage("Tanggal di luar periode akademik aktif.");
      return;
    }
    setDays((current) => [...current.filter((day) => day.date !== date), { date, kind, note: note.trim() || null }].sort((left, right) => left.date.localeCompare(right.date)));
    setNote("");
    setMessage("");
  }

  async function save() {
    if (!schoolId || locked) return;
    setBusy(true);
    try {
      const result = await api<Payload>(`/api/v1/schools/${schoolId}/attendance-completeness`, {
        method: "PUT",
        body: JSON.stringify({ days }),
      });
      setPayload(result);
      setDays(result.rule?.days ?? []);
      setMessage(result.rule?.status === "ACTIVE"
        ? "Perubahan aturan aktif tersimpan dan dicatat. Nilai serta absensi tidak diubah."
        : "Kalender tersimpan sebagai draf. Rapor belum memakai aturan ini.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Kalender gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!schoolId || !mayActivate || dirty || requiredDays === 0) return;
    setBusy(true);
    try {
      const result = await api<Payload>(`/api/v1/schools/${schoolId}/attendance-completeness/activate`, { method: "POST" });
      setPayload(result);
      setDays(result.rule?.days ?? []);
      setMessage("Aturan kelengkapan absensi semester aktif. Perubahan ini dicatat dan menjadi syarat rapor.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Aturan gagal diaktifkan.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <p className="text-sm text-slate-600">Pengaturan kelengkapan absensi hanya tersedia untuk Wakasek Kurikulum dan admin sekolah.</p>;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Kelengkapan Absensi</h1>
        <p className="text-sm text-slate-500">Kalender tanggal pembelajaran pada periode akademik aktif. Hari wajib tidak dibuat otomatis.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      {!period ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Tidak ada periode akademik aktif.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Summary label="Semester" value={`${period.name} · ${period.startDate} sampai ${period.endDate}`} />
            <Summary label="Status aturan" value={status === "ACTIVE" ? "Aktif" : status === "DRAFT" ? "Draf" : "Belum ada aturan"} />
            <Summary label="Hari wajib" value={String(requiredDays)} />
            <Summary label="Libur / tidak wajib" value={`${days.filter((day) => day.kind === "LIBUR").length} / ${days.filter((day) => day.kind === "TIDAK_WAJIB").length}`} />
          </div>
          {status === "ACTIVE" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Aturan ini aktif. Perubahan dicatat dan mengubah syarat kelengkapan rapor. Nilai dan absensi siswa tidak diubah.</p>
          ) : (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Draf belum dipakai rapor. Rapor tetap belum dikonfigurasi sampai aturan diaktifkan Wakasek Kurikulum.</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              Tanggal
              <input className={`${inputClass} mt-1 block`} type="date" min={period.startDate} max={period.endDate} value={date} onChange={(event) => setDate(event.target.value)} disabled={locked} />
            </label>
            <label className="text-xs text-slate-500">
              Jenis
              <select className={`${inputClass} mt-1 block`} value={kind} onChange={(event) => setKind(event.target.value as Kind)} disabled={locked}>
                <option value="PEMBELAJARAN">Pembelajaran</option>
                <option value="LIBUR">Libur</option>
                <option value="TIDAK_WAJIB">Tidak wajib absensi</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Catatan
              <input className={`${inputClass} mt-1 block w-48`} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} disabled={locked} />
            </label>
            <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" onClick={assignDay} disabled={locked || !date}>Tetapkan</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Jenis</th>
                  <th className="px-3 py-2">Catatan</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {days.length === 0 ? (
                  <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Belum ada tanggal yang ditetapkan. Hari efektif tidak dibuat otomatis.</td></tr>
                ) : days.map((day) => (
                  <tr key={day.date} className="border-t border-slate-100">
                    <td className="px-3 py-2">{day.date}</td>
                    <td className="px-3 py-2">{KIND_LABEL[day.kind]}</td>
                    <td className="px-3 py-2">{day.note ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-rose-700" disabled={locked} onClick={() => setDays((current) => current.filter((item) => item.date !== day.date))}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-9 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || locked || !dirty} onClick={() => void save()}>Simpan kalender</button>
            {mayActivate && status !== "ACTIVE" ? (
              <button type="button" className="h-9 rounded-lg bg-emerald-800 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || dirty || requiredDays === 0} onClick={() => void activate()}>Aktifkan aturan</button>
            ) : null}
          </div>
          {!mayActivate ? <p className="text-sm text-slate-600">Pengaktifan aturan hanya dapat dilakukan Wakasek Kurikulum.</p> : null}
          {locked ? <p className="text-sm text-slate-600">Perubahan aturan aktif hanya dapat dilakukan Wakasek Kurikulum.</p> : null}
        </>
      )}
    </section>
  );
}

function calendarKey(days: Day[]): string {
  return [...days].sort((left, right) => left.date.localeCompare(right.date)).map((day) => `${day.date}|${day.kind}|${day.note ?? ""}`).join("\n");
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
