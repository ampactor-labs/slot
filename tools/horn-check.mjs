// horn-check — an independent re-derivation of every number the page prints.
//
// This file deliberately does NOT import anything from index.html. It builds the
// horn again from first principles, in different terms where it can, and asserts
// against the table published in the README. Agreement between two derivations is
// evidence; a checker that imported the page's own math would only prove the page
// agrees with itself.
//
//   node tools/horn-check.mjs
//
// Exit 0 and a table means every published number reproduces. Exit 1 names the
// first disagreement and the size of it.

const SEMI = Math.pow(2, 1 / 12);
const L_OPEN = 1473; // mm — 4 ft 10 in, the standard figure for a B-flat trumpet
const F1 = 440 * Math.pow(2, (46 - 69) / 12); // concert B-flat 2, the nominal fundamental

let failures = 0;
function check(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) {
    failures++;
    console.error(
      `FAIL ${label}\n     got  ${got.toFixed(4)}\n     want ${want.toFixed(4)} (+/- ${tol})`
    );
  }
  return ok;
}

// --- the horn, built twice over ------------------------------------------

// Derivation A: valve slides sized as a fraction of the open horn.
const cutA = (semitones) => L_OPEN * (Math.pow(SEMI, semitones) - 1);

// Derivation B: the same length reached from the frequency side. A valve that
// lowers the open horn by n semitones must divide its pitch by 2^(n/12), and
// length is inversely proportional to pitch, so the tube it adds is whatever
// makes that true. Different route, same tubing.
const cutB = (semitones) => {
  const fOpen = F1;
  const fTarget = F1 / Math.pow(2, semitones / 12);
  return (L_OPEN * fOpen) / fTarget - L_OPEN;
};

for (const n of [1, 2, 3]) {
  check(`valve cut ${n} semitone(s), two derivations`, cutA(n), cutB(n), 1e-9);
}

const CUT = { 1: 2, 2: 1, 3: 3 }; // valve -> semitones it lowers the open horn
const dL = Object.fromEntries(Object.entries(CUT).map(([v, n]) => [v, cutA(n)]));

check("valve 1 tubing (mm)", dL[1], 180.39, 0.01);
check("valve 2 tubing (mm)", dL[2], 87.59, 0.01);
check("valve 3 tubing (mm)", dL[3], 278.7, 0.01);

// --- the seven slots ------------------------------------------------------

const SLOTS = [
  { valves: [], semis: 0, name: "open" },
  { valves: [2], semis: 1, name: "2" },
  { valves: [1], semis: 2, name: "1" },
  { valves: [1, 2], semis: 3, name: "1-2" },
  { valves: [2, 3], semis: 4, name: "2-3" },
  { valves: [1, 3], semis: 5, name: "1-3" },
  { valves: [1, 2, 3], semis: 6, name: "1-2-3" },
];

const cents = (f, ref) => 1200 * Math.log2(f / ref);

// Pitch is inversely proportional to sounding length, so a horn that is too
// short for the note it is being asked to play comes out sharp.
function slotCents(slot, extraMm = 0) {
  const actual = L_OPEN + slot.valves.reduce((s, v) => s + dL[v], 0) + extraMm;
  const needed = L_OPEN * Math.pow(SEMI, slot.semis);
  return cents(1 / actual, 1 / needed);
}

const PUBLISHED_SLOT = {
  open: 0.0,
  2: 0.0,
  1: 0.0,
  "1-2": 10.63,
  "2-3": 15.53,
  "1-3": 30.32,
  "1-2-3": 53.56,
};

console.log("\nslot     actual mm   needed mm    cents   slide throw");
for (const slot of SLOTS) {
  const actual = L_OPEN + slot.valves.reduce((s, v) => s + dL[v], 0);
  const needed = L_OPEN * Math.pow(SEMI, slot.semis);
  const c = slotCents(slot);
  const throwMm = (needed - actual) / 2; // a U-slide adds twice what you pull
  check(`slot ${slot.name} cents`, c, PUBLISHED_SLOT[slot.name], 0.01);
  console.log(
    `  ${slot.name.padEnd(7)}${actual.toFixed(1).padStart(9)}${needed
      .toFixed(1)
      .padStart(12)}${c.toFixed(2).padStart(9)}` +
      (throwMm > 0.1
        ? `   ${throwMm.toFixed(1)} mm (${(throwMm / 25.4).toFixed(2)} in)`
        : "   —")
  );
}

// Throw for a column alone, ignoring which partial is riding on it.
const columnThrow = (name) => {
  const s = SLOTS.find((x) => x.name === name);
  return (L_OPEN * Math.pow(SEMI, s.semis) - (L_OPEN + s.valves.reduce((a, v) => a + dL[v], 0))) / 2;
};
check("1-3 column throw (mm)", columnThrow("1-3"), 17.07, 0.01);
check("1-2-3 column throw (mm)", columnThrow("1-2-3"), 31.73, 0.01);

// A pulled slide has to actually fix the note it was pulled for.
for (const name of ["1-3", "1-2-3"]) {
  const s = SLOTS.find((x) => x.name === name);
  check(`slot ${name} corrected by its own throw`, slotCents(s, 2 * columnThrow(name)), 0, 1e-9);
}

// --- the partials ---------------------------------------------------------

// Row error is the harmonic series measured against equal temperament: partial p
// sits 1200*log2(p) cents above the fundamental, and the tempered grid sits at
// whole hundreds.
function partialCents(p) {
  const above = 1200 * Math.log2(p);
  return above - 100 * Math.round(above / 100);
}

const PUBLISHED_PARTIAL = { 2: 0.0, 3: 1.96, 4: 0.0, 5: -13.69, 6: 1.96, 7: -31.17, 8: 0.0 };
console.log("\npartial   cents vs tempered");
for (let p = 2; p <= 8; p++) {
  const c = partialCents(p);
  check(`partial ${p} cents`, c, PUBLISHED_PARTIAL[p], 0.01);
  console.log(`  ${String(p).padEnd(9)}${c.toFixed(2).padStart(8)}`);
}

// Two of these are named intervals and have to match their textbook values.
check("partial 3 is the pure fifth's excess", 1200 * Math.log2(3 / 2) - 700, 1.955, 0.001);
check("partial 5 is the pure third's deficit", 1200 * Math.log2(5 / 4) - 400, -13.686, 0.001);
check("partial 7 is the septimal deficit", 1200 * Math.log2(7 / 4) - 1000, -31.174, 0.001);

// --- written pitch --------------------------------------------------------

// A B-flat trumpet sounds a major second below what its player reads, so the
// written name is the concert note plus two semitones. Spellings are the ones on
// a beginner's fingering chart.
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const written = (p, semis) => {
  const midi = 46 + Math.round(12 * Math.log2(p)) - semis + 2;
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
};

// --- the addition table ---------------------------------------------------

// The page's central claim: a cell's error is the row error plus the column
// error, with nothing left over. Check that against the honest computation,
// which multiplies frequencies rather than adding cents.
console.log("\naddition table (row + column) vs direct computation");
let worst = { cents: 0 },
  nearest = null,
  maxResidual = 0;
for (let p = 2; p <= 8; p++) {
  for (const slot of SLOTS) {
    const sum = partialCents(p) + slotCents(slot);

    // Direct route: build the sounding frequency from the tube, build the note
    // the player is aiming at from the tempered grid, and compare the two. The
    // target is the note the fingering intends, not the nearest note to what
    // came out — past 50 cents those stop being the same note.
    const actualLen = L_OPEN + slot.valves.reduce((s, v) => s + dL[v], 0);
    const fActual = F1 * p * (L_OPEN / actualLen);
    const fTarget = F1 * Math.pow(2, (Math.round(12 * Math.log2(p)) - slot.semis) / 12);
    const direct = cents(fActual, fTarget);

    maxResidual = Math.max(maxResidual, Math.abs(sum - direct));
    if (Math.abs(sum) > Math.abs(worst.cents)) worst = { cents: sum, p, slot: slot.name };
    // The interesting cancellation is between two errors that are both real, so
    // exclude the rows and columns that are already exact.
    const bothWrong = Math.abs(partialCents(p)) > 0.01 && Math.abs(slotCents(slot)) > 0.01;
    if (bothWrong && (nearest === null || Math.abs(sum) < Math.abs(nearest.cents)))
      nearest = { cents: sum, p, slot: slot.name };
  }
}
check("cents add exactly (max residual across 49 cells)", maxResidual, 0, 1e-9);
console.log(`  max residual across 49 cells: ${maxResidual.toExponential(2)} cents`);

// The count the page leads with.
let inTune = 0;
for (let p = 2; p <= 8; p++)
  for (const slot of SLOTS)
    if (Math.abs(partialCents(p) + slotCents(slot)) < 0.05) inTune++;
check("cells exactly in tune", inTune, 9, 0);
check("cells out of tune", 49 - inTune, 40, 0);
console.log(`  in tune: ${inTune} of 49`);

check("worst cell is +55.51", worst.cents, 55.51, 0.01);
check("worst cell is partial 3 on 1-2-3", worst.p === 3 && worst.slot === "1-2-3" ? 1 : 0, 1, 0);
console.log(
  `  worst cell:   partial ${worst.p} on ${worst.slot} (written ${written(worst.p, 6)})` +
    `   ${worst.cents.toFixed(2)} cents`
);
check("best two-error cancellation is -0.85", nearest.cents, -0.85, 0.01);
check("that cancellation is partial 7 on 1-3", nearest.p === 7 && nearest.slot === "1-3" ? 1 : 0, 1, 0);
console.log(
  `  nearest true: partial ${nearest.p} on ${nearest.slot} (written ${written(nearest.p, 5)})` +
    `   ${nearest.cents.toFixed(2)} cents`
);

// --- the two throws a player is actually taught ---------------------------

// Low D and low C-sharp both sit on the 3rd partial, so their throws carry the
// partial's own 1.96-cent sharpness on top of the column error. These are the
// numbers the page prints, and they are not the column throws above.
const noteThrow = (p, name) => {
  const s = SLOTS.find((x) => x.name === name);
  const need = L_OPEN * Math.pow(SEMI, s.semis) * Math.pow(2, partialCents(p) / 1200);
  return (need - (L_OPEN + s.valves.reduce((a, v) => a + dL[v], 0))) / 2;
};
console.log("\nthe notes with a ring on them");
for (const [p, name, note, want] of [
  [3, "1-3", "written D4", 18.18],
  [3, "1-2-3", "written C#4", 32.91],
]) {
  const t = noteThrow(p, name);
  check(`${note} throw (mm)`, t, want, 0.01);
  console.log(`  ${note.padEnd(12)} partial ${p} on ${name.padEnd(6)} ${t.toFixed(2)} mm ` +
    `(${(t / 25.4).toFixed(2)} in)`);
}

// --- the maker's compromise ----------------------------------------------

// Cutting valve 3 long trades slot-3-alone against 1-3 and 1-2-3. Assert the
// direction of the trade and the published 3.2-semitone row.
console.log("\nvalve-3 cut sweep      slot 3    1-3     1-2-3");
const sweep = (n3) => {
  const d3 = cutA(n3);
  return [
    [[3], 3],
    [[1, 3], 5],
    [[1, 2, 3], 6],
  ].map(([valves, semis]) => {
    const actual = L_OPEN + valves.reduce((s, v) => s + (v === 3 ? d3 : dL[v]), 0);
    return cents(1 / actual, 1 / (L_OPEN * Math.pow(SEMI, semis)));
  });
};
for (const n3 of [3.0, 3.1, 3.2, 3.3]) {
  const [a, b, c] = sweep(n3);
  console.log(
    `  ${n3.toFixed(2)}              ${a.toFixed(2).padStart(7)}${b.toFixed(2).padStart(8)}${c
      .toFixed(2)
      .padStart(8)}`
  );
}
const [s3, s13, s123] = sweep(3.2);
check("3.2-semitone cut: slot 3 alone", s3, -20.0, 0.01);
check("3.2-semitone cut: 1-3", s13, 12.17, 0.01);
check("3.2-semitone cut: 1-2-3", s123, 36.2, 0.01);
// No fixed cut makes all three vanish, which is the whole reason the slide moves.
const anyPerfect = [3.0, 3.1, 3.2, 3.3, 3.4, 3.5].some((n) =>
  sweep(n).every((c) => Math.abs(c) < 1)
);
check("no fixed cut tunes all three slots", anyPerfect ? 1 : 0, 0, 0);

// --- the fingering chart --------------------------------------------------

// If the model is right, walking it produces the fingering chart in the front of
// every beginner's method book. Spot-check the notes a player actually names.
const CHART = [
  [2, 0, "C4"], // low C, open
  [2, 6, "F#3"], // the lowest note on the horn
  [3, 0, "G4"], // second-line G, open
  [4, 0, "C5"], // third-space C, open
  [4, 3, "A4"], // A above the staff's middle, 1-2
  [5, 0, "E5"], // open
  [6, 2, "F5"], // 1
  [8, 0, "C6"], // high C, open
];
console.log("\nfingering chart spot-check");
for (const [p, semis, want] of CHART) {
  const got = written(p, semis);
  check(`partial ${p} slot ${semis} is written ${want}`, got === want ? 1 : 0, 1, 0);
  console.log(`  partial ${p}, ${SLOTS.find((s) => s.semis === semis).name.padEnd(6)} -> ${got}`);
}

// --- verdict --------------------------------------------------------------

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nall checks pass.");
