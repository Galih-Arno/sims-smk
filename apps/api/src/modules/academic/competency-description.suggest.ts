const HIGH = 80;
const MID = 70;

export type SuggestionObjective = {
  label: string;
  uh: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
};

export type SuggestionScope = {
  label: string;
  score: number | null;
};

export type SuggestionInput = {
  finalStatus: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";
  finalScore: number | null;
  objectives: SuggestionObjective[];
  scopes: SuggestionScope[];
};

export function suggestDescription(input: SuggestionInput): { text: string | null; warnings: string[] } {
  const warnings: string[] = [];
  if (input.objectives.length === 0 || input.scopes.length === 0) warnings.push("TP atau lingkup materi belum tersedia.");
  if (input.finalStatus !== "SIAP" || input.finalScore === null) warnings.push("Nilai akhir resmi belum lengkap.");
  const items = [
    ...input.objectives.map((item) => ({ label: item.label, value: mean([item.uh, item.t1, item.t2, item.t3]) })),
    ...input.scopes.map((item) => ({ label: item.label, value: item.score })),
  ];
  if (input.objectives.some((item) => mean([item.uh, item.t1, item.t2, item.t3]) === null)) {
    warnings.push("Hasil tujuan pembelajaran belum lengkap.");
  }
  if (input.scopes.some((item) => item.score === null)) warnings.push("Hasil lingkup materi belum lengkap.");
  if (warnings.length > 0) return { text: null, warnings };
  const present = items.filter((item): item is { label: string; value: number } => item.value !== null);
  const baik = present.filter((item) => item.value >= HIGH).map((item) => item.label);
  const cukup = present.filter((item) => item.value >= MID && item.value < HIGH).map((item) => item.label);
  const perlu = present.filter((item) => item.value < MID).map((item) => item.label);
  const sentences: string[] = [];
  if (baik.length > 0) sentences.push(`Menunjukkan penguasaan yang baik pada ${joinList(baik)}.`);
  if (cukup.length > 0) sentences.push(`Menunjukkan penguasaan yang cukup pada ${joinList(cukup)}.`);
  if (perlu.length > 0) sentences.push(`Perlu peningkatan pada ${joinList(perlu)}.`);
  sentences.push(`Nilai akhir ${input.finalScore}.`);
  return { text: sentences.join(" "), warnings: [] };
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((item): item is number => item !== null);
  if (present.length === 0) return null;
  return present.reduce((total, item) => total + item, 0) / present.length;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
}
