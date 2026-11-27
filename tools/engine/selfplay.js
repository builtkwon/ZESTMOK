// Boss (ai.js) vs local Rapfi, every boss move graded by Rapfi (docs/boss-ai-v2.md P2). PC only, slow (~boss 3.5-5 s per move).
// Run: RAPFI=/path/to/pbrain-rapfi node tools/engine/selfplay.js [pairs=10] [seed=1] [nodes=200000] [out=selfplay.jsonl]
// Each pair = same random balanced 4-stone opening twice, boss black then boss white (like tests/duel.js).
// Output: one JSON line per boss move:
//   {g, ply, pos: moves before (play order), p, boss: [r,c], best: Rapfi's move, wrBefore: Rapfi winrate for the boss
//    before its move, wrAfter: same after it (1 - Rapfi's winrate as the opponent), ms}
// plus one {g, result: 'win'|'loss'|'draw', bossBlack, moves} line per game.
const fs = require('fs');
const AI = require(process.env.BOSS_AI || '../../ai.js'); // BOSS_AI: grade another copy (e.g. the old boss)
try { require('../../ai-open.js'); if (AI.setOpening) AI.setOpening(globalThis.AI_OPEN); } catch (e) { /* no book */ }
const Rapfi = require('./rapfi.js');
const N = 15, PAIRS = +process.argv[2] || 10, NODES = +process.argv[4] || 200000, OUT = process.argv[5] || 'selfplay.jsonl';
let seed = +process.argv[3] || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
// winner check under our rule: black needs exactly five, white five or more
function wins(b, r, c) {
  const p = b[r][c];
  return DIRS.some(([dr, dc]) => { let n = 1; for (const s of [1, -1]) for (let k = 1; b[r + dr * s * k] && b[r + dr * s * k][c + dc * s * k] === p; k++) n++; return p === 1 ? n === 5 : n >= 5; });
}
function opening() {
  const b = Array.from({ length: N }, () => Array(N).fill(0)), mv = [];
  while (mv.length < 4) { const r = 5 + Math.floor(rnd() * 5), c = 5 + Math.floor(rnd() * 5); if (b[r][c]) continue; b[r][c] = mv.length % 2 ? 2 : 1; mv.push([r, c]); }
  return mv;
}
// Rapfi's move, never one our rule forbids (renju's false-three rule can differ from ai.js in rare shapes)
async function rapfiMove(e, b, moves) {
  const block = [];
  for (;;) {
    const a = await e.best(moves, block), [r, c] = a.move;
    if (moves.length % 2 || !AI.forbidden(b, r, c)) return a;
    block.push(r + ',' + c);
  }
}

(async () => {
  const e = new Rapfi(); await e.start({ nodes: NODES });
  const out = fs.createWriteStream(OUT);
  let W = 0, L = 0, D = 0, g = 0;
  for (let i = 0; i < PAIRS; i++) {
    let open; // balanced openings only: Rapfi gives black to move 30-70%
    for (;;) { open = opening(); const wr = (await e.best(open)).wr; if (wr >= 0.3 && wr <= 0.7) break; }
    for (const bossBlack of [true, false]) {
      g++;
      AI.setMemory(null); // no learning between games
      const b = Array.from({ length: N }, () => Array(N).fill(0)), moves = [];
      open.forEach(([r, c], k) => { b[r][c] = k % 2 ? 2 : 1; moves.push([r, c]); });
      let result = 'draw', pending = null;
      while (moves.length < N * N) {
        const p = moves.length % 2 ? 2 : 1, boss = (p === 1) === bossBlack;
        let r, c;
        if (boss) {
          const grade = await rapfiMove(e, b, moves); // Rapfi's view of the boss's position
          const t0 = Date.now(), m = AI.bestMove(b, p, 'boss');
          r = m.row; c = m.col;
          pending = { g, ply: moves.length, pos: moves.slice(), p, boss: [r, c], best: grade.move, wrBefore: grade.wr, ms: Date.now() - t0 };
        } else {
          const a = await rapfiMove(e, b, moves);
          if (pending) { pending.wrAfter = a.wr === undefined ? undefined : 1 - a.wr; out.write(JSON.stringify(pending) + '\n'); pending = null; }
          [r, c] = a.move;
        }
        if (b[r][c]) throw new Error(`occupied ${r},${c} by ${boss ? 'boss' : 'rapfi'}`);
        b[r][c] = p; moves.push([r, c]);
        if (wins(b, r, c)) { result = boss ? 'win' : 'loss'; break; }
      }
      if (pending) { pending.wrAfter = result === 'win' ? 1 : 0; out.write(JSON.stringify(pending) + '\n'); }
      if (result === 'win') W++; else if (result === 'loss') L++; else D++;
      out.write(JSON.stringify({ g, result, bossBlack, moves }) + '\n');
      console.log(`game ${g} boss ${bossBlack ? 'black' : 'white'}: ${result} in ${moves.length} moves (total boss ${W}W ${L}L ${D}D)`);
    }
  }
  out.end(); e.quit();
})();
