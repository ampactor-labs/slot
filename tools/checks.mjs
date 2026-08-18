// Checks run inside the page by tools/cdp.mjs.
//
// Two jobs. First, that the interface is wired: forty-nine cells exist, the
// toggles move what they claim to move, the slide corrects what it is pulled
// for. Second, and the reason this file exists at all, that the page's own
// arithmetic still agrees with tools/horn-check.mjs — which derives the same
// numbers a different way and never sees this code.

const near = (want, tol) => (got) => typeof got === "number" && Math.abs(got - want) <= tol;

export async function run({ check, evalJS, sleep, shot, emulate, viewport }) {
  // ── structure ───────────────────────────────────────────────────────────
  await check("lattice cells", "document.querySelectorAll('.cell').length", 49);
  await check("column heads", "document.querySelectorAll('.colhead').length", 7);
  await check("row heads", "document.querySelectorAll('.rowhead').length", 7);
  await check(
    "boot selection is the worst note",
    "JSON.stringify(selected)",
    JSON.stringify({ p: 3, si: 6 })
  );
  // The page opens on the maker's-compromise cut, not the ideal one: nearly
  // every real horn is cut long, so this is the closer default before you've
  // calibrated against your own tuner.
  await check("boots on the maker's compromise, not the ideal cut", "rig.cut3", near(3.2, 1e-9));
  await evalJS("document.getElementById('pIdeal').click()");

  // ── the published numbers ───────────────────────────────────────────────
  // Every value here is asserted independently by tools/horn-check.mjs, at
  // the ideal cut set explicitly above regardless of the page's own default.
  await check("open horn is exact", "cell(2,0).cents", near(0, 1e-9));
  await check("1-2 column", "cell(2,3).cents", near(10.63, 0.01));
  await check("2-3 column", "cell(2,4).cents", near(15.53, 0.01));
  await check("1-3 column", "cell(2,5).cents", near(30.32, 0.01));
  await check("1-2-3 column", "cell(2,6).cents", near(53.56, 0.01));
  await check("partial 3 row", "cell(3,0).cents", near(1.96, 0.01));
  await check("partial 5 row", "cell(5,0).cents", near(-13.69, 0.01));
  await check("partial 7 row", "cell(7,0).cents", near(-31.17, 0.01));
  await check("worst cell on the horn", "cell(3,6).cents", near(55.51, 0.01));
  await check("where the two errors cancel", "cell(7,5).cents", near(-0.86, 0.01));

  // The claim the prose makes: a cell is the row plus the column, exactly.
  await check(
    "cents add across all 49 cells",
    `(() => { let worst = 0;
       for (const p of PARTIALS) for (let i = 0; i < 7; i++) {
         const c = cell(p, i);
         worst = Math.max(worst, Math.abs(c.cents - (c.row + c.col))); }
       return worst; })()`,
    near(0, 1e-12)
  );

  // Sounding frequency has to follow from the tube, not from the cents label.
  await check(
    "actual Hz matches the tube length",
    `(() => { const c = cell(2,6);
       return c.actualHz - F1 * 2 * (L_OPEN / slotLen(SLOTS[6])); })()`,
    near(0, 1e-9)
  );

  // ── written vs concert ──────────────────────────────────────────────────
  await check("open partial 2 is written C4", "noteName(cell(2,0).writtenMidi).pc + noteName(cell(2,0).writtenMidi).oct", "C4");
  await check("open partial 2 is concert B♭3", "noteName(cell(2,0).concertMidi).pc + noteName(cell(2,0).concertMidi).oct", "B♭3");
  await check("lowest note is written F♯3", "noteName(cell(2,6).writtenMidi).pc + noteName(cell(2,6).writtenMidi).oct", "F♯3");
  await check("open partial 8 is written C6", "noteName(cell(8,0).writtenMidi).pc + noteName(cell(8,0).writtenMidi).oct", "C6");
  await check(
    "written is concert plus two semitones, every cell",
    `(() => { let bad = 0;
       for (const p of PARTIALS) for (let i = 0; i < 7; i++) {
         const c = cell(p, i); if (c.writtenMidi - c.concertMidi !== 2) bad++; }
       return bad; })()`,
    0
  );
  // First cell in DOM order is the top-left: partial 8, open.
  await check("grid reads written by default", "document.querySelector('.cell .note').textContent", "C6");
  await evalJS("document.getElementById('tPitch').click()");
  await check("concert toggle relabels the grid", "document.querySelector('.cell .note').textContent", "B♭5");
  await evalJS("document.getElementById('tPitch').click()");
  await check("and back", "document.querySelector('.cell .note').textContent", "C6");

  // ── the error layers ────────────────────────────────────────────────────
  await evalJS("document.getElementById('tValve').click()");
  await check("valve layer off zeroes the columns", "cell(2,6).cents", near(0, 1e-9));
  await check("valve layer off leaves the rows alone", "cell(5,0).cents", near(-13.69, 0.01));
  await evalJS("document.getElementById('tPart').click()");
  await check(
    "both layers off is a horn with no errors",
    `(() => { let worst = 0;
       for (const p of PARTIALS) for (let i = 0; i < 7; i++)
         worst = Math.max(worst, Math.abs(cell(p, i).cents));
       return worst; })()`,
    near(0, 1e-9)
  );
  await evalJS("document.getElementById('tValve').click(); document.getElementById('tPart').click()");
  await check("layers restored", "cell(3,6).cents", near(55.51, 0.01));

  // ── the slide ───────────────────────────────────────────────────────────
  // The two the page prints, both on the 3rd partial: written D4 and written C♯4.
  await check("throw for low D (partial 3, 1-3)", "throwFor(cell(3,5))", near(18.18, 0.01));
  await check("throw for low C♯ (partial 3, 1-2-3)", "throwFor(cell(3,6))", near(32.906, 0.01));
  // The same columns one partial down need slightly less, the partial being exact there.
  await check("throw for written G3 (partial 2, 1-3)", "throwFor(cell(2,5))", near(17.065, 0.01));
  await check("throw for low F♯ (partial 2, 1-2-3)", "throwFor(cell(2,6))", near(31.729, 0.01));
  await check("no throw where valve 3 isn't down", "throwFor(cell(2,3))", null);

  await evalJS("select(2, 5, false); document.getElementById('bTrue').click()");
  await check("kicking it true zeroes that cell", "cell(2,5).cents", near(0, 1e-6));
  await check("and the slide moved to the computed throw", "rig.pull3", near(17.065, 0.01));
  await check("while the open horn is untouched", "cell(2,0).cents", near(0, 1e-9));
  await check("and the 2-3 slot it shares is now 16 cents flat", "cell(2,4).cents", near(-16.3, 0.05));
  await evalJS("document.getElementById('pReset').click()");
  await check("slides back in", "rig.pull3", 0);

  // ── the maker's compromise ──────────────────────────────────────────────
  await evalJS("document.getElementById('pMaker').click()");
  await check("3.2-semitone cut: 1-3 improves", "cell(2,5).cents", near(12.17, 0.01));
  await check("3.2-semitone cut: 1-2-3 improves", "cell(2,6).cents", near(36.2, 0.01));
  await check("3.2-semitone cut: slot 2-3 pays for it", "cell(2,4).cents", (g) => g < -3);
  await evalJS("document.getElementById('pIdeal').click()");

  // ── sound ───────────────────────────────────────────────────────────────
  // Muted by the harness; this asserts the graph builds and schedules.
  await check("a note builds an audio graph",
    "(() => { const o = blow(440, audio().currentTime, 0.2); return o.type; })()", "custom");
  await check("the error demo schedules four voices without throwing",
    "(() => { hearError(cell(3,6)); return ac.state !== 'closed'; })()", true);

  // ── the ear ─────────────────────────────────────────────────────────────
  // No microphone in headless, but detect() is pure: feed it a known signal.
  const tone = (hz, harmonics) => `(() => {
    const rate = 48000, n = 4096, x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      ${harmonics.map((a, k) => `v += ${a} * Math.sin(2 * Math.PI * ${hz} * ${k + 1} * i / rate);`).join("\n      ")}
      x[i] = v * 0.3;
    }
    return detect(x, rate); })()`;

  await check("detects a low C (233.08 Hz)",
    `${tone(233.08, [1, 0.6, 0.4, 0.25, 0.15])}.hz`, near(233.08, 0.6));
  await check("detects a high C (932.33 Hz)",
    `${tone(932.33, [1, 0.5, 0.3])}.hz`, near(932.33, 2.0));
  await check("a missing fundamental does not fool it",
    `${tone(261.63, [0, 1, 0.7, 0.4])}.hz`, near(261.63, 1.0));
  await check("silence returns nothing",
    "detect(new Float32Array(4096), 48000)", null);
  await check("noise below the clarity floor returns nothing",
    `(() => { const x = new Float32Array(4096);
       for (let i = 0; i < 4096; i++) x[i] = (Math.random() - 0.5) * 0.5;
       return detect(x, 48000); })()`, null);

  // The map from a heard frequency back to a fingering.
  await check("a heard low C♯ lands on partial 3, 1-2-3",
    "JSON.stringify((c => [c.c.p, c.c.si])(nearestCell(cell(3,6,true).actualHz)))",
    JSON.stringify([3, 6]));
  await check("the ear ignores the display toggles",
    `(() => { document.getElementById('tValve').click();
       const r = nearestCell(cell(3,6,true).actualHz);
       document.getElementById('tValve').click();
       return r.c.p === 3 && r.c.si === 6; })()`, true);

  // ── the count in the lede ───────────────────────────────────────────────
  await check(
    "nine cells in tune, forty wrong",
    `(() => { let z = 0;
       for (const p of PARTIALS) for (let i = 0; i < 7; i++)
         if (Math.abs(cell(p, i).cents) < 0.05) z++;
       return [z, 49 - z]; })()`,
    [9, 40]
  );

  // ── the narrow case ─────────────────────────────────────────────────────
  // The lattice is wider than a phone on purpose and scrolls inside its own
  // box. The page around it must not.
  await viewport(360, 740);
  await sleep(300);
  await check("no horizontal scroll on a 360px screen",
    "document.documentElement.scrollWidth <= window.innerWidth", true);
  await check("the lattice itself does scroll",
    "(() => { const s = document.querySelector('.scroller');\n       return s.scrollWidth > s.clientWidth; })()", true);
  await check("every cell is still a 44px tap target",
    `(() => [...document.querySelectorAll('.cell')]
       .every(c => c.getBoundingClientRect().height >= 44))()`, true);
  // Scroll the grid to its far right and the partial numbers must stay put.
  await check("the partial column stays pinned while the grid scrolls",
    `(() => { const s = document.querySelector('.scroller');
       const h = document.querySelector('.rowhead');
       const before = h.getBoundingClientRect().left;
       s.scrollLeft = s.scrollWidth;
       const after = h.getBoundingClientRect().left;
       s.scrollLeft = 0;
       return Math.abs(after - before) < 1; })()`, true);
  await shot("docs/img/phone.png");
  await viewport(null);
  await sleep(200);

  // ── render, both themes ─────────────────────────────────────────────────
  await evalJS("select(3, 6, false); window.scrollTo(0, 0)");
  await emulate([{ name: "prefers-color-scheme", value: "light" }]);
  await sleep(250);
  await shot("docs/img/lattice-light.png");
  await emulate([{ name: "prefers-color-scheme", value: "dark" }]);
  await sleep(250);
  await shot("docs/img/lattice-dark.png");
}
