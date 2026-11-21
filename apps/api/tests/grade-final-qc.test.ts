import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinalGrade, type FinalPolicy, type FinalStudentInput } from "../src/modules/academic/grade-final.calc.ts";

const policy: FinalPolicy = {
  formativeMode: "COMBINED",
  useFormative: true,
  useSummative: true,
  useSts: true,
  useSas: true,
  weightFormative: 30,
  weightUh: null,
  weightT1: null,
  weightT2: null,
  weightT3: null,
  weightSummative: 30,
  weightSts: 20,
  weightSas: 20,
  remedialPolicy: "HIGHEST",
  remedialCap: null,
  roundingMode: "INTEGER",
};

function student(extra: Partial<FinalStudentInput> = {}): FinalStudentInput {
  return {
    formative: [
      {
        code: "TP1",
        uh: 80,
        t1: null,
        t2: null,
        t3: null,
        remedial: null,
        uhSubmitted: true,
        t1Submitted: false,
        t2Submitted: false,
        t3Submitted: false,
        remedialSubmitted: false,
      },
    ],
    summative: [{ code: "LM1", score: 70, remedial: null, submitted: true }],
    sts: 90,
    sas: 100,
    stsSubmitted: true,
    sasSubmitted: true,
    ...extra,
  };
}

describe("Simulasi bobot QC-04B1", () => {
  it("menghitung 30/30/20/20, remedial tertinggi, kekosongan, dan memisahkan draf dari hasil resmi", () => {
    const ready = computeFinalGrade(policy, student(), "official");
    assert.equal(ready.status, "SIAP");
    assert.equal(ready.score, 83);

    const remediated = computeFinalGrade(
      policy,
      student({
        formative: [
          {
            code: "TP1",
            uh: 60,
            t1: null,
            t2: null,
            t3: null,
            remedial: 75,
            uhSubmitted: true,
            t1Submitted: false,
            t2Submitted: false,
            t3Submitted: false,
            remedialSubmitted: true,
          },
        ],
      }),
      "official",
    );
    assert.equal(remediated.score, 82);

    const empty = computeFinalGrade(policy, student({ sas: null }), "preview");
    assert.equal(empty.status, "BELUM_LENGKAP");
    assert.equal(empty.score, null);

    const draft = student({
      formative: [
        {
          code: "TP1",
          uh: 80,
          t1: null,
          t2: null,
          t3: null,
          remedial: null,
          uhSubmitted: false,
          t1Submitted: false,
          t2Submitted: false,
          t3Submitted: false,
          remedialSubmitted: false,
        },
      ],
    });
    const preview = computeFinalGrade(policy, draft, "preview");
    const official = computeFinalGrade(policy, draft, "official");
    assert.equal(preview.status, "PRATINJAU");
    assert.equal(preview.score, 83);
    assert.equal(official.status, "BELUM_LENGKAP");
    assert.equal(official.score, null);
  });
});
