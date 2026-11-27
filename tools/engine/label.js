// Training positions for tools/engine/fit-eval.js (docs/boss-ai-v2.md P4). PC only.
// Run: RAPFI=/path/to/pbrain-rapfi node tools/engine/label.js [games=300] [seed=1] [nodes=100000] [out=labels.jsonl]
// Games: random 2-6 stone opening in the centre, then each move is Rapfi's (70%) or a random pick from ai.js's top-8 candidates (30%),
// so positions include the bad moves a search tree is full of. Every position is labelled with Rapfi at `nodes`:
//   {pos: moves in play order, best: [r,c] (never ai.js-forbidden for black), wr: Rapfi winrate for the side to move}
const fs = require('fs');
const AI = require('../../ai.js');
const Rapfi = require('./rapfi.js');
const N = 15, GAMES = +process.argv[2] || 300, NODES = +process.argv[4] || 100000, OUT = process.argv[5] || 'labels.jsonl';
let seed = +process.argv[3] || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const wins = (b, r, c) => { const p = b[r][c]; return DIRS.some(([dr, dc]) => { let n = 1; for (const s of [1, -1]) for (let k = 1; b[r + dr * s * k] && b[r + dr * s * k][c + dc * s * k] === p; k++) n++; return p === 1 ? n === 5 : n >= 5; }); };
async function rapfiMove(e, b, moves) { // never a cell ai.js forbids for black
  const block = [];
  for (;;) { const a = await e.best(moves, block), [r, c] = a.move; if (moves.length % 2 || !AI.forbidden(b, r, c)) return a; block.push(r + ',' + c); }
}
(async () => {
  const e = new Rapfi(); await e.start({ nodes: NODES });
  const out = fs.createWriteStream(OUT); let n = 0;
  for (let g = 0; g < GAMES; g++) {
    const b = Array.from({ length: N }, () => Array(N).fill(0)), moves = [], open = 2 + Math.floor(rnd() * 5);
    while (moves.length < open) {
      const p = moves.length % 2 ? 2 : 1, r = 4 + Math.floor(rnd() * 7), c = 4 + Math.floor(rnd() * 7);
      if (b[r][c] || (p === 1 && AI.forbidden(b, r, c))) continue;
      b[r][c] = p; moves.push([r, c]);
    }
    while (moves.length < 120) {
      const p = moves.length % 2 ? 2 : 1, a = await rapfiMove(e, b, moves);
      out.write(JSON.stringify({ pos: moves.slice(), best: a.move, wr: a.wr }) + '\n'); n++;
      let [r, c] = a.move;
      if (rnd() < 0.3) {
        AI.bestMove(Array.from({ length: N }, () => Array(N).fill(0)), p, 'easy'); // sets ai.js's rule flag for p
        const cs = AI.candidates(b, p, 8); const m = cs[Math.floor(rnd() * cs.length)];
        if (m) { r = m.row; c = m.col; }
      }
      b[r][c] = p; moves.push([r, c]);
      if (wins(b, r, c)) break;
    }
    if (g % 10 === 9) console.log(`game ${g + 1}: ${n} positions`);
  }
  out.end(); e.quit();
})();
