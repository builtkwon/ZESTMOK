// Checks that the local Rapfi build plays OUR rule (Korean: black 3-3 and overline forbidden, black 4-4 allowed).
// 1) random dense positions: Rapfi forbidden points must equal ai.js forbidden() on every empty cell
// 2) fixed 4-4 positions: as black Rapfi takes the 4-4 win; as white it blocks it
// Run: RAPFI=/path/to/pbrain-rapfi node tools/engine/check-rule.js [positions=300] [seed=1]
const AI = require('../../ai.js');
const Rapfi = require('./rapfi.js');
const N = 15, P = +process.argv[2] || 300;
let seed = +process.argv[3] || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const five = (b, r, c, p) => DIRS.some(([dr, dc]) => { let n = 1; for (const s of [1, -1]) for (let k = 1; b[r + dr * s * k] && b[r + dr * s * k][c + dc * s * k] === p; k++) n++; return n >= 5; });

// random game in the 7x7 centre: legal for black, nobody has five yet
function position(len) {
  const b = Array.from({ length: N }, () => Array(N).fill(0)), mv = [];
  for (let tries = 0; mv.length < len && tries < 2000; tries++) {
    const p = mv.length % 2 ? 2 : 1, r = 4 + Math.floor(rnd() * 7), c = 4 + Math.floor(rnd() * 7);
    if (b[r][c] || (p === 1 && AI.forbidden(b, r, c))) continue;
    b[r][c] = p; if (five(b, r, c, p)) { b[r][c] = 0; continue; }
    mv.push([r, c]);
  }
  if (mv.length % 2) { const [r, c] = mv.pop(); b[r][c] = 0; } // black to move
  return { b, mv };
}

(async () => {
  const e = new Rapfi(); await e.start({ ms: 300 });
  let withF = 0, bad = 0, cells = 0;
  for (let i = 0; i < P; i++) {
    const { b, mv } = position(16 + Math.floor(rnd() * 30));
    const ours = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!b[r][c] && AI.forbidden(b, r, c)) ours.push(r + ',' + c);
    const theirs = await e.forbid(mv);
    if (ours.length) withF++; cells += ours.length;
    const a = new Set(ours), t = new Set(theirs);
    const diff = [...a].filter(x => !t.has(x)).map(x => 'ai-only ' + x).concat([...t].filter(x => !a.has(x)).map(x => 'rapfi-only ' + x));
    if (diff.length) { bad++; if (bad <= 5) console.log('MISMATCH', JSON.stringify(mv), diff.join(' ')); }
  }
  console.log(`forbidden sets: ${P} positions, ${withF} with forbidden points (${cells} cells), ${bad} mismatches`);

  // 4-4: black stones make two broken fours through (7,7) once it is filled: row 7 (7,4),(7,5),(7,6) and column 7 (4,7),(5,7),(6,7)
  // closed with white stones on the far ends so each line is a plain four (not an open-four threat) and not a three
  const blackSt = [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]], whiteSt = [[7, 3], [3, 7], [12, 12], [12, 0], [0, 12], [14, 14]];
  const seq = []; for (let i = 0; i < 6; i++) seq.push(blackSt[i], whiteSt[i]);
  const bb = Array.from({ length: N }, () => Array(N).fill(0)); seq.forEach(([r, c], i) => bb[r][c] = i % 2 ? 2 : 1);
  console.log('4-4 point (7,7) forbidden in ai.js:', AI.forbidden(bb, 7, 7), '| in rapfi:', (await e.forbid(seq)).includes('7,7'));
  const asBlack = (await e.best(seq)).move;
  console.log('rapfi as black plays', asBlack.join(','), asBlack.join(',') === '7,7' ? 'OK (takes 4-4)' : '(expected 7,7)');
  // white to move: same shape, one extra white tempo far away; white must block the 4-4 point (or win first - it cannot)
  const seqW = seq.concat([[14, 0]]);
  const asWhite = (await e.best(seqW)).move;
  console.log('rapfi as white plays', asWhite.join(','), ['7,7', '7,8', '8,7'].includes(asWhite.join(',')) ? 'OK (stops 4-4)' : '(expected 7,7 7,8 or 8,7)');
  e.quit();
})();
