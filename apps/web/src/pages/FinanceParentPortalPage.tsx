import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type BillPayment = {
  id: string;
  amount: number;
  channel: "TUNAI" | "TRANSFER_MANUAL" | "MIDTRANS" | "XENDIT";
  referenceCode: string | null;
  paidAt: string;
};

type BillItem = {
  id: string;
  studentId: string;
  title: string;
  fundBucket: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: "BELUM_LUNAS" | "SEBAGIAN" | "LUNAS";
  student: { id: string; name: string; nisn: string; nis: string | null; class: { name: string } | null };
  payments: BillPayment[];
};

type LinkedChild = {
  id: string;
  name: string;
  nisn: string;
  nis: string | null;
  relation: string;
  class: { name: string } | null;
};

type BillsResponse = {
  canManageFinance: boolean;
  linkedChildren: LinkedChild[];
  bills: BillItem[];
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function FinanceParentPortalPage() {
  const { schoolId, school } = useSchoolScope();
  const [data, setData] = useState<BillsResponse | null>(null);
  const [showAmount, setShowAmount] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [fundBucket, setFundBucket] = useState("SPP");
  const [amount, setAmount] = useState(150000);
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadBills = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await api<BillsResponse>(`/api/v1/schools/${schoolId}/bills`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 0) {
        setMessage({ kind: "err", text: err.message });
      }
    }
  }, [schoolId]);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);

  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setMessage(null);
    try {
      await api(`/api/v1/schools/${schoolId}/bills`, {
        method: "POST",
        body: JSON.stringify({
          studentId: studentId.trim(),
          title,
          fundBucket,
          amount: Number(amount),
          dueDate: dueDate || null,
        }),
      });
      setTitle("");
      setMessage({ kind: "ok", text: "Tagihan siswa berhasil diterbitkan." });
      await loadBills();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal menerbitkan tagihan." });
    }
  }

  async function handleQuickPay(bill: BillItem) {
    if (!schoolId) return;
    const sisa = Math.max(0, bill.amount - bill.paidAmount);
    if (sisa <= 0) return;
    setMessage(null);
    try {
      await api(`/api/v1/schools/${schoolId}/bills/${bill.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: sisa,
          channel: "TUNAI",
          idempotencyKey: `pay-${bill.id}-${Date.now()}`,
        }),
      });
      setMessage({ kind: "ok", text: `Pembayaran ${bill.title} untuk ${bill.student.name} berhasil dicatat.` });
      await loadBills();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal mencatat pembayaran." });
    }
  }

  const canManage = Boolean(data?.canManageFinance);
  const totalUnpaid = (data?.bills ?? []).reduce(
    (acc, b) => acc + Math.max(0, b.amount - b.paidAmount),
    0
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-6">
      {/* Super-App Hero Card */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-1 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
              {canManage ? "Keuangan & Administrasi SPP" : "Portal Wali Murid & Siswa"}
            </span>
            <h1 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
              {canManage ? "Tagihan & Pembayaran Siswa" : "Status SPP & Pemantauan Siswa"}
            </h1>
            <p className="mt-1 text-xs text-slate-300">"SMK PGRI Pasir Sakti"</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAmount((prev) => !prev)}
            className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20"
          >
            {showAmount ? "Sembunyikan Saldo" : "Tampilkan Saldo"}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <p className="text-[11px] font-medium text-slate-300">Total Sisa Tagihan Tercatat</p>
          <p className="mt-1 text-2xl font-extrabold text-[#F5C400]">
            {showAmount ? formatRupiah(totalUnpaid) : "Rp •••••••"}
          </p>
        </div>
      </section>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3.5 text-sm font-medium ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      {!canManage && data && data.linkedChildren.length > 0 && (
        <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-extrabold text-[#0D1B4C]">Profil Peserta Didik Terhubung</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.linkedChildren.map((child) => (
              <div key={child.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-extrabold text-[#0D1B4C]">{child.name}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Kelas: <strong>{child.class?.name ?? "Belum diatur"}</strong> • NISN: {child.nisn}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Hubungan: {child.relation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <form onSubmit={handleCreateBill} className="space-y-4 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-extrabold text-[#0D1B4C]">Terbitkan Tagihan Baru</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">ID Siswa</label>
              <input
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="ID data siswa"
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">Jenis / Pos Tagihan</label>
              <select
                value={fundBucket}
                onChange={(e) => setFundBucket(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-[#0D1B4C] focus:bg-white"
              >
                <option value="SPP">SPP Bulanan</option>
                <option value="KOMITE">Dana Komite</option>
                <option value="PRAKTIK">Biaya Praktik Bengkel/Lab</option>
                <option value="LAINNYA">Lainnya</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">Judul Tagihan</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: SPP Bulan November 2026"
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">Nominal (Rp)</label>
              <input
                type="number"
                min={1000}
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-bold text-slate-700">Jatuh Tempo (Opsional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>
            <button
              type="submit"
              className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[#0D1B4C] to-[#1D3587] px-6 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/20 transition hover:brightness-110 sm:w-auto"
            >
              Terbitkan Tagihan
            </button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-extrabold text-[#0D1B4C]">
          Daftar Tagihan & Riwayat Pembayaran ({data?.bills.length ?? 0})
        </h2>
        {(data?.bills ?? []).length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
            Belum ada tagihan yang tercatat.
          </div>
        ) : (
          (data?.bills ?? []).map((bill) => {
            const sisa = Math.max(0, bill.amount - bill.paidAmount);
            return (
              <div key={bill.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-[#0D1B4C]/8 px-2.5 py-0.5 text-[11px] font-extrabold text-[#0D1B4C]">
                      {bill.fundBucket}
                    </span>
                    <h3 className="mt-1.5 text-base font-extrabold text-slate-900">{bill.title}</h3>
                    <p className="text-xs text-slate-500">
                      {bill.student.name} ({bill.student.class?.name ?? "Kelas"})
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                      bill.status === "LUNAS"
                        ? "bg-emerald-100 text-emerald-800"
                        : bill.status === "SEBAGIAN"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {bill.status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="text-xs">
                    <span className="text-slate-500">Nominal: </span>
                    <strong className="text-sm text-slate-900">
                      {showAmount ? formatRupiah(bill.amount) : "Rp •••••••"}
                    </strong>
                    {sisa > 0 && (
                      <span className="ml-3 text-rose-700 font-bold">
                        Sisa: {showAmount ? formatRupiah(sisa) : "Rp •••••••"}
                      </span>
                    )}
                  </div>

                  {canManage && sisa > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleQuickPay(bill)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-700"
                    >
                      Catat Lunas Tunai
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
