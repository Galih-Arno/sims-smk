export type CellMark = "empty" | "dirty" | "saving" | "saved" | "failed" | "submitted" | "revision";

export const GRADE_MARKS: { mark: CellMark; label: string }[] = [
  { mark: "empty", label: "Kosong" },
  { mark: "dirty", label: "Perubahan belum disimpan" },
  { mark: "saving", label: "Sedang menyimpan" },
  { mark: "saved", label: "Tersimpan" },
  { mark: "failed", label: "Gagal menyimpan" },
  { mark: "submitted", label: "Terkunci, sudah dikirim" },
  { mark: "revision", label: "Menunggu revisi" },
];

export function gradeMarkLabel(mark: CellMark): string {
  return GRADE_MARKS.find((item) => item.mark === mark)?.label ?? "Status nilai";
}

export function GradeMarkIcon({ mark, className = "h-3.5 w-3.5" }: { mark: CellMark; className?: string }) {
  const tone =
    mark === "empty"
      ? "text-slate-400"
      : mark === "dirty"
        ? "text-amber-500"
        : mark === "saving"
          ? "text-sky-600"
          : mark === "saved"
            ? "text-teal-600"
            : mark === "failed"
              ? "text-red-600"
              : mark === "submitted"
                ? "text-violet-700"
                : "text-orange-600";
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`${className} ${tone} ${mark === "saving" ? "animate-spin" : ""}`}>
      {mark === "empty" ? <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {mark === "dirty" ? <circle cx="8" cy="8" r="3.2" fill="currentColor" /> : null}
      {mark === "saving" ? (
        <>
          <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
          <path d="M8 2.75a5.25 5.25 0 0 1 5.25 5.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : null}
      {mark === "saved" ? <path d="M3.2 8.3 6.4 11.4 12.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {mark === "failed" ? (
        <>
          <path d="M8 2.4 14.2 13.2H1.8L8 2.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6.2v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
        </>
      ) : null}
      {mark === "submitted" ? (
        <>
          <rect x="3.2" y="7" width="9.6" height="6.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </>
      ) : null}
      {mark === "revision" ? (
        <path d="M13 8.2A5 5 0 1 1 11.2 4.2M13 2.6V5.4H10.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

export function GradeMarkLegend() {
  return (
    <ul aria-label="Arti ikon status nilai" className="flex w-max flex-nowrap items-center gap-x-2.5 text-[11px] leading-none text-slate-600">
      {GRADE_MARKS.map((item) => (
        <li key={item.mark} className="inline-flex items-center gap-1">
          <GradeMarkIcon mark={item.mark} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
