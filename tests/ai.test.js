// Run: node tests/ai.test.js
const assert = require('assert');
const { bestMove, forbidden, posKey, learn, setMemory, getMemory, setBook, predict } = require('../ai.js');
const N = 15;
const empty = () => Array.from({ length: N }, () => Array(N).fill(0));
const put = (b, p, cells) => cells.forEach(([r, c]) => { b[r][c] = p; });

// 1) takes an immediate win (open four -> five), every level
for (const lv of ['easy', 'normal', 'hard']) {
  const b = empty(); put(b, 1, [[7, 4], [7, 5], [7, 6], [7, 7]]); put(b, 2, [[8, 5], [8, 6], [8, 7]]);
  const m = bestMove(b, 1, lv);
  assert(m.row === 7 && (m.col === 3 || m.col === 8), `${lv} should win, got ${JSON.stringify(m)}`);
}
// 2) blocks a closed four (normal/hard always)
for (const lv of ['normal', 'hard']) {
  const b = empty(); put(b, 2, [[7, 4], [7, 5], [7, 6], [7, 7]]); put(b, 1, [[7, 3], [8, 5], [8, 6]]);
  const m = bestMove(b, 1, lv);
  assert(m.row === 7 && m.col === 8, `${lv} should block, got ${JSON.stringify(m)}`);
}
// 3) hard stops an open three before it becomes an open four
{
  const b = empty(); put(b, 2, [[7, 6], [7, 7], [7, 8]]); put(b, 1, [[6, 6], [8, 9]]);
  const m = bestMove(b, 1, 'hard');
  assert(m.row === 7 && (m.col === 5 || m.col === 9), `hard should cap open three, got ${JSON.stringify(m)}`);
}
// Korean rules (AI as black): never plays 3-3 or 6+; exact five still wins
{
  // 3-3 at (7,7): open threes (7,5),(7,6) and (5,7),(6,7)
  const b = empty(); put(b, 1, [[7, 5], [7, 6], [5, 7], [6, 7]]); put(b, 2, [[0, 0], [0, 2], [14, 14], [14, 12]]);
  assert(forbidden(b, 7, 7), '3-3 must be forbidden');
  // 4-4 is allowed
  const c = empty(); put(c, 1, [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]);
  assert(!forbidden(c, 7, 7), '4-4 allowed');
  // 6+ forbidden, but a move making exactly five is fine
  const d = empty(); put(d, 1, [[7, 3], [7, 4], [7, 5], [7, 7], [7, 8]]);
  assert(forbidden(d, 7, 6), 'overline forbidden');
  const e = empty(); put(e, 1, [[7, 3], [7, 4], [7, 5], [7, 6]]);
  assert(!forbidden(e, 7, 7) && !forbidden(e, 7, 2), 'exact five allowed');
  // a line that is already a four is not a three: four + three is legal (was wrongly 3-3)
  const f = empty(); put(f, 1, [[7, 4], [7, 6], [7, 8], [5, 5], [6, 5]]);
  assert(!forbidden(f, 7, 5), '4-3 allowed (X*X.X four + open three)');
  // a "four" whose end would make six is not an open four for black, so not a three
  const g = empty(); put(g, 1, [[6, 4], [6, 5], [6, 7], [6, 9], [4, 8], [5, 8]]);
  assert(!forbidden(g, 6, 8), 'overline-ended shape is not a three');
  put(g, 1, [[4, 10], [5, 9]]); // plus a real open three on the anti-diagonal: now 3-3
  assert(forbidden(g, 6, 8), 'two real threes still forbidden');
  // the AI (black) must not pick the 3-3 point even when it is the best-looking move
  for (const lv of ['easy', 'normal', 'hard']) for (let i = 0; i < 20; i++) {
    const m = bestMove(b, 1, lv);
    assert(!forbidden(b, m.row, m.col), `${lv} played a forbidden move ${JSON.stringify(m)}`);
  }
}
// 3b) hard sees a forced win by consecutive fours and stops the opponent's
{
  // black plays (7,7): row four (7,4..7) + column four (4..7,7) -> two five-cells = unstoppable
  const win = empty(); put(win, 1, [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]); put(win, 2, [[0, 0], [0, 2], [14, 14]]);
  const m = bestMove(win, 1, 'hard');
  assert(m.row === 7 || m.col === 7, `hard should start a four-chain on the row/column, got ${JSON.stringify(m)}`);
  // white (opponent) threatens the same double-four; black has no threat of its own -> must break it on that row/column
  const def = empty(); put(def, 2, [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]); put(def, 1, [[0, 0], [0, 2], [14, 14]]);
  const d = bestMove(def, 1, 'hard');
  assert(d.row === 7 || d.col === 7, `hard should break the four-chain on the row/column, got ${JSON.stringify(d)}`);
}
// 4) strength: hard beats a one-ply greedy opponent (both colors); move time stays bounded
function greedy(b, p) {
  const { evaluate } = require('../ai.js'); let best = null, bs = -Infinity;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c]) continue;
    let near = false;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (b[r + i] && b[r + i][c + j]) near = true;
    if (!near && b.flat().some(Boolean)) continue;
    b[r][c] = p; const s = evaluate(b, p) + Math.random(); b[r][c] = 0;
    if (s > bs) { bs = s; best = { row: r, col: c }; }
  }
  return best || { row: 7, col: 7 };
}
function five(b, r, c) {
  const p = b[r][c];
  return [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => {
    let n = 1;
    for (const s of [1, -1]) for (let k = 1; b[r + dr * s * k] && b[r + dr * s * k][c + dc * s * k] === p; k++) n++;
    return n >= 5;
  });
}
function play(aiColor, lv) {
  const b = empty(); let turn = 1, maxMs = 0;
  for (let t = 0; t < N * N; t++) {
    const t0 = Date.now();
    const m = turn === aiColor ? bestMove(b, turn, lv) : greedy(b, turn);
    if (turn === aiColor) maxMs = Math.max(maxMs, Date.now() - t0);
    assert(b[m.row][m.col] === 0, 'illegal move');
    if (turn === aiColor && aiColor === 1) assert(!forbidden(b, m.row, m.col), 'AI black broke Korean rules');
    b[m.row][m.col] = turn;
    if (five(b, m.row, m.col)) return { win: turn === aiColor, maxMs };
    turn = 3 - turn;
  }
  return { win: false, maxMs };
}
let wins = 0, worst = 0;
for (const color of [1, 2, 1, 2]) { const r = play(color, 'hard'); wins += r.win; worst = Math.max(worst, r.maxMs); }
console.log(`hard vs greedy: ${wins}/4 wins, slowest move ${worst}ms`);
assert(wins >= 3, 'hard should beat greedy');
assert(worst < 3500, "move too slow");
// 5) learning: after a loss the AI stops repeating the same moves; it also steers away from replies the human already won with
{
  setMemory(null);
  const b = empty(); put(b, 1, [[7, 7], [6, 8]]); put(b, 2, [[7, 8]]);
  const m1 = bestMove(b, 2, 'normal');
  assert(bestMove(b, 2, 'normal').row === m1.row && bestMove(b, 2, 'normal').col === m1.col, 'AI is deterministic before learning');
  const key = posKey(b, 2);
  learn([{ p: 2, row: m1.row, col: m1.col, key }], 2, 1); // human won
  const m2 = bestMove(b, 2, 'normal');
  assert(!(m2.row === m1.row && m2.col === m1.col), 'AI must not repeat a move it lost with');
  assert(getMemory().streak === 1, 'streak counts consecutive human wins');
  learn([], 2, 2); assert(getMemory().streak === 0, 'AI win resets the streak');
  // human reply memory: a reply that won before is predicted and the move leading to it is avoided
  setMemory(null);
  const c = empty(); put(c, 1, [[7, 7]]); put(c, 2, [[6, 6]]);
  const n1 = bestMove(c, 1, 'normal'); // here the human is "2"; ai plays 1
  c[n1.row][n1.col] = 1;
  const hk = posKey(c, 2);
  learn([{ p: 2, row: 3, col: 3, key: hk }], 1, 2); // human (2) won through (3,3) from that position
  c[n1.row][n1.col] = 0;
  assert(predict((c[n1.row][n1.col] = 1, c), 2).row === 3, 'predicts the remembered reply');
  c[n1.row][n1.col] = 0;
  const n2 = bestMove(c, 1, 'normal');
  assert(!(n2.row === n1.row && n2.col === n1.col), 'AI avoids moves that lead to a known human win');
  setMemory(null);
}
// shared book: its avoid list works like local memory, but learning never writes into it
{
  setMemory(null); setBook(null);
  const b = empty(); put(b, 1, [[7, 7], [6, 8]]); put(b, 2, [[7, 8]]);
  const m1 = bestMove(b, 2, 'normal'), key = posKey(b, 2);
  setBook({ avoid: { [key]: [m1.row + ',' + m1.col] }, hum: {} });
  const m2 = bestMove(b, 2, 'normal');
  assert(!(m2.row === m1.row && m2.col === m1.col), 'AI skips a move the shared book avoids');
  assert(!Object.keys(getMemory().avoid).length, 'book is not copied into local memory');
  setBook(null);
  const m3 = bestMove(b, 2, 'normal');
  assert(m3.row === m1.row && m3.col === m1.col, 'clearing the book restores the move');
}
// boss defense: fork cells, doomed flag, boss occupies a white 3-3 point
{
  const { forkCells, openFourCells } = require('../ai.js');
  const f = empty(); put(f, 2, [[7, 5], [7, 6], [5, 7], [6, 7]]); put(f, 1, [[0, 0], [0, 2], [14, 14], [14, 12]]);
  assert(forkCells(f, 2, 0).some(([r, c]) => r === 7 && c === 7), 'white 3-3 point found');
  assert(forkCells(f, 1, 0).length === 0, 'black has no 3-3 point (forbidden)');
  const g = empty(); put(g, 2, [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]);
  assert(forkCells(g, 2, 1).some(([r, c]) => r === 7 && c === 7), 'white 4-4 point found');
  // 4-3: closed three on a row (blocked left) + two on a column -> (7,7) makes a four and an open three
  const h = empty(); put(h, 2, [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]); put(h, 1, [[7, 3], [0, 0], [14, 14]]);
  assert(forkCells(h, 2, 3).some(([r, c]) => r === 7 && c === 7), 'white 4-3 point found');
  const hb = empty(); put(hb, 1, [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]); put(hb, 2, [[7, 3], [0, 0], [14, 14]]);
  assert(forkCells(hb, 1, 3).some(([r, c]) => r === 7 && c === 7), 'black 4-3 point found (legal for black)');
  assert(openFourCells(empty().map((r, i) => (i === 7 ? r.map((_, c) => (c >= 6 && c <= 8 ? 2 : 0)) : r)), 2).length === 2, 'open three -> 2 open-four cells');
  // white open four on board, black cannot stop it: boss flags doomed
  const d = empty(); put(d, 2, [[7, 5], [7, 6], [7, 7], [7, 8]]); put(d, 1, [[0, 0], [0, 2], [14, 14]]);
  const m = bestMove(d, 1, 'boss');
  assert(m.doomed, 'open four against the boss = doomed');
  // all fork kinds are defended every move (no random focus): boss takes the white 3-3 point, every time
  for (let i = 0; i < 3; i++) { const r1 = bestMove(f, 1, 'boss'); assert(r1.row === 7 && r1.col === 7, `boss should take the white 3-3 point, got ${JSON.stringify(r1)}`); }
}
// rotation memory: a loss is remembered in all 4 rotations (posKey of the rotated board == rotKey of the key)
{
  const { rotKey } = require('../ai.js');
  setMemory(null);
  const rotB = (b) => b.map((row, r) => row.map((_, c) => b[N - 1 - c][r])); // new[r][c] = old[N-1-c][r]  <=> old (r,c) -> new (c, N-1-r)
  const b = empty(); put(b, 1, [[7, 7], [6, 8], [3, 4]]); put(b, 2, [[7, 8], [2, 9]]);
  let k = posKey(b, 2), rb = b;
  for (let t = 0; t < 4; t++) { rb = rotB(rb); k = rotKey(k); assert(k === posKey(rb, 2), `rotKey matches rotated board (t=${t + 1})`); }
  const m1 = bestMove(b, 2, 'normal');
  learn([{ p: 2, row: m1.row, col: m1.col, key: posKey(b, 2) }], 2, 1); // human won
  assert(getMemory().streak === 1, 'one game = one result, not four');
  let rb2 = b, mr = [m1.row, m1.col];
  for (let t = 0; t < 3; t++) {
    rb2 = rotB(rb2); mr = [mr[1], N - 1 - mr[0]];
    const m2 = bestMove(rb2, 2, 'normal');
    assert(!(m2.row === mr[0] && m2.col === mr[1]), `rotated board (${90 * (t + 1)}deg): AI must not repeat the lost move`);
  }
  setMemory(null);
}
// VCT: finds a winning open-three sequence, not just fours
{
  const { vct, bestMove: bm } = require('../ai.js');
  bm(empty(), 2, 'easy'); // sets rule flags for p=2
  const f = empty(); put(f, 2, [[7, 5], [7, 6], [5, 7], [6, 7]]); put(f, 1, [[0, 0], [0, 2], [14, 14], [14, 12]]);
  const w = vct(f, 2, 4, { t: Date.now() + 2000 });
  assert(w, 'vct should find a forced win (3-3 setup)');
  const sparse = empty(); put(sparse, 2, [[7, 7]]); put(sparse, 1, [[7, 8]]);
  assert(!vct(sparse, 2, 4, { t: Date.now() + 2000 }), 'no forced win from a lone stone');
}
console.log('ok');
