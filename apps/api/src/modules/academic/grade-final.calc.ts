export type FinalGradeStatus = "BELUM_DIKONFIGURASI" | "BELUM_LENGKAP" | "PRATINJAU" | "SIAP";
export type FinalGradeBasis = "preview" | "official";
export type FinalRoundingMode = "NONE" | "INTEGER" | "ONE_DECIMAL" | "TWO_DECIMALS";
export type FinalRemedialPolicy = "HIGHEST" | "LATEST" | "CAPPED";
export type FinalFormativeMode = "COMBINED" | "SEPARATE";

export type FinalPolicy = {
  formativeMode: FinalFormativeMode;
  useFormative: boolean;
  useSummative: boolean;
  useSts: boolean;
  useSas: boolean;
  weightFormative: number | null;
  weightUh: number | null;
  weightT1: number | null;
  weightT2: number | null;
  weightT3: number | null;
  weightSummative: number | null;
  weightSts: number | null;
  weightSas: number | null;
  remedialPolicy: FinalRemedialPolicy;
  remedialCap: number | null;
  roundingMode: FinalRoundingMode;
};

export type FinalTpInput = {
  code: string;
  uh: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  remedial: number | null;
  uhSubmitted: boolean;
  t1Submitted: boolean;
  t2Submitted: boolean;
  t3Submitted: boolean;
  remedialSubmitted: boolean;
};

export type FinalLmInput = {
  code: string;
  score: number | null;
  remedial: number | null;
  submitted: boolean;
};

export type FinalStudentInput = {
  formative: FinalTpInput[];
  summative: FinalLmInput[];
  sts: number | null;
  sas: number | null;
  stsSubmitted: boolean;
  sasSubmitted: boolean;
};

export type FinalPart = {
  label: string;
  value: number | null;
  weight: number;
  contribution: number | null;
  submitted: boolean;
  note: string;
};

export type FinalComputation = {
  status: FinalGradeStatus;
  score: number | null;
  formula: string;
  parts: FinalPart[];
};

const ROUNDING_LABEL: Record<FinalRoundingMode, string> = {
  NONE: "tanpa pembulatan",
  INTEGER: "bilangan bulat",
  ONE_DECIMAL: "satu desimal",
  TWO_DECIMALS: "dua desimal",
};

const REMEDIAL_LABEL: Record<FinalRemedialPolicy, string> = {
  HIGHEST: "nilai tertinggi",
  LATEST: "nilai terbaru",
  CAPPED: "batas maksimum",
};

function usable(value: number | null, submitted: boolean, official: boolean): number | null {
  if (value === null) return null;
  if (official && !submitted) return null;
  return value;
}

function applyRemedial(original: number | null, remedial: number | null, policy: FinalPolicy): number | null {
  if (policy.remedialPolicy === "HIGHEST") {
    if (original === null) return remedial;
    if (remedial === null) return original;
    return Math.max(original, remedial);
  }
  if (policy.remedialPolicy === "LATEST") return remedial === null ? original : remedial;
  if (remedial === null) return original;
  if (policy.remedialCap === null) return null;
  return Math.min(remedial, policy.remedialCap);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number, mode: FinalRoundingMode): number {
  const factor = mode === "INTEGER" ? 1 : mode === "ONE_DECIMAL" ? 10 : mode === "TWO_DECIMALS" ? 100 : 10000;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function text(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function part(label: string, value: number | null, weight: number, submitted: boolean, note: string): FinalPart {
  return {
    label,
    value,
    weight,
    contribution: value === null ? null : (value * weight) / 100,
    submitted,
    note,
  };
}

function formativeCombined(input: FinalStudentInput, policy: FinalPolicy, official: boolean): FinalPart {
  const values: number[] = [];
  let submitted = input.formative.length > 0;
  const notes: string[] = [];
  for (const tp of input.formative) {
    const sources = [
      { value: usable(tp.uh, tp.uhSubmitted, official), submitted: tp.uhSubmitted },
      { value: usable(tp.t1, tp.t1Submitted, official), submitted: tp.t1Submitted },
      { value: usable(tp.t2, tp.t2Submitted, official), submitted: tp.t2Submitted },
      { value: usable(tp.t3, tp.t3Submitted, official), submitted: tp.t3Submitted },
    ].filter((item): item is { value: number; submitted: boolean } => item.value !== null);
    const remedial = usable(tp.remedial, tp.remedialSubmitted, official);
    const value = applyRemedial(mean(sources.map((item) => item.value)), remedial, policy);
    if (value === null || sources.some((item) => !item.submitted) || (remedial !== null && !tp.remedialSubmitted)) submitted = false;
    if (value !== null) values.push(value);
    notes.push(`${tp.code}: ${value === null ? "kosong" : text(value)}`);
  }
  const value = input.formative.length > 0 && values.length === input.formative.length ? mean(values) : null;
  return part(
    "Formatif",
    value,
    policy.weightFormative ?? 0,
    submitted && value !== null,
    `UH dan tugas digabung, rata-rata tiap TP, remedial ${REMEDIAL_LABEL[policy.remedialPolicy]}. ${notes.join("; ")}`,
  );
}

function adjustSeparate(values: Array<number | null>, remedial: number | null, policy: FinalPolicy): Array<number | null> {
  if (remedial === null) return values;
  let lowest = -1;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) continue;
    if (lowest === -1 || value < (values[lowest] ?? Number.POSITIVE_INFINITY)) lowest = index;
  }
  if (lowest === -1) return values;
  const next = values.slice();
  next[lowest] = applyRemedial(values[lowest] ?? null, remedial, policy);
  return next;
}

function formativeSeparate(input: FinalStudentInput, policy: FinalPolicy, official: boolean): FinalPart[] {
  const labels = [
    ["UH", policy.weightUh],
    ["Tugas 1", policy.weightT1],
    ["Tugas 2", policy.weightT2],
    ["Tugas 3", policy.weightT3],
  ] as const;
  const collected = labels.map(() => [] as number[]);
  const submitted = labels.map(() => input.formative.length > 0);
  for (const tp of input.formative) {
    const raw = [
      usable(tp.uh, tp.uhSubmitted, official),
      usable(tp.t1, tp.t1Submitted, official),
      usable(tp.t2, tp.t2Submitted, official),
      usable(tp.t3, tp.t3Submitted, official),
    ];
    const remedial = usable(tp.remedial, tp.remedialSubmitted, official);
    const adjusted = adjustSeparate(raw, remedial, policy);
    const flags = [tp.uhSubmitted, tp.t1Submitted, tp.t2Submitted, tp.t3Submitted];
    const sources = [tp.uh, tp.t1, tp.t2, tp.t3];
    adjusted.forEach((value, index) => {
      if (value === null) submitted[index] = false;
      else collected[index]?.push(value);
      if (sources[index] !== null && !flags[index] && value !== null) submitted[index] = false;
      if (remedial !== null && value !== raw[index] && tp.remedial !== null && !tp.remedialSubmitted) submitted[index] = false;
    });
  }
  return labels.map(([label, weight], index) => {
    const values = collected[index] ?? [];
    const complete = input.formative.length > 0 && values.length === input.formative.length;
    return part(
      label,
      complete ? mean(values) : null,
      weight ?? 0,
      Boolean(submitted[index]) && complete,
      `Dihitung terpisah. Remedial ${REMEDIAL_LABEL[policy.remedialPolicy]} mengganti nilai terendah pada TP bila ada.`,
    );
  });
}

function summative(input: FinalStudentInput, policy: FinalPolicy, official: boolean): FinalPart {
  const values: number[] = [];
  let submitted = input.summative.length > 0;
  const notes: string[] = [];
  for (const item of input.summative) {
    const score = usable(item.score, item.submitted, official);
    const remedial = usable(item.remedial, item.submitted, official);
    const value = applyRemedial(score, remedial, policy);
    if (value === null || !item.submitted) submitted = false;
    if (value !== null) values.push(value);
    notes.push(`${item.code}: ${value === null ? "kosong" : text(value)}`);
  }
  const complete = input.summative.length > 0 && values.length === input.summative.length;
  return part(
    "Sumatif",
    complete ? mean(values) : null,
    policy.weightSummative ?? 0,
    submitted && complete,
    `Rata-rata lingkup materi, remedial ${REMEDIAL_LABEL[policy.remedialPolicy]}. ${notes.join("; ")}`,
  );
}

export function computeFinalGrade(policy: FinalPolicy | null, input: FinalStudentInput, basis: FinalGradeBasis): FinalComputation {
  if (!policy) {
    return { status: "BELUM_DIKONFIGURASI", score: null, formula: "Belum ada konfigurasi penilaian yang aktif.", parts: [] };
  }
  const official = basis === "official";
  const parts: FinalPart[] = [];
  if (policy.useFormative && policy.formativeMode === "COMBINED") parts.push(formativeCombined(input, policy, official));
  if (policy.useFormative && policy.formativeMode === "SEPARATE") parts.push(...formativeSeparate(input, policy, official));
  if (policy.useSummative) parts.push(summative(input, policy, official));
  if (policy.useSts) {
    const value = usable(input.sts, input.stsSubmitted, official);
    parts.push(part("STS", value, policy.weightSts ?? 0, value !== null && input.stsSubmitted, value === null ? "STS kosong." : "Nilai STS."));
  }
  if (policy.useSas) {
    const value = usable(input.sas, input.sasSubmitted, official);
    parts.push(part("SAS", value, policy.weightSas ?? 0, value !== null && input.sasSubmitted, value === null ? "SAS kosong." : "Nilai SAS."));
  }
  if (parts.length === 0 || parts.some((item) => item.value === null)) {
    return {
      status: "BELUM_LENGKAP",
      score: null,
      formula: "Komponen wajib belum lengkap. Nilai kosong tidak dihitung sebagai nol.",
      parts,
    };
  }
  const raw = parts.reduce((sum, item) => sum + (item.contribution ?? 0), 0);
  const ready = parts.every((item) => item.submitted);
  if (official && !ready) {
    return {
      status: "BELUM_LENGKAP",
      score: null,
      formula: "Nilai resmi hanya memakai komponen yang sudah dikirim dan diterima wali kelas.",
      parts,
    };
  }
  const score = roundScore(raw, policy.roundingMode);
  const expression = parts.map((item) => `${text(item.value ?? 0)} × ${text(item.weight)}%`).join(" + ");
  const formula = `${expression} = ${text(raw)}. Pembulatan ${ROUNDING_LABEL[policy.roundingMode]}: ${text(score)}.`;
  return { status: ready ? "SIAP" : "PRATINJAU", score, formula, parts };
}
