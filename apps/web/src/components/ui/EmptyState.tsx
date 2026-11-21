export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center shadow-sm">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}
