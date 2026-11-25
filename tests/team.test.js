// Run: node tests/team.test.js
const assert = require('assert');
const T = require('../team.js');
const P = (id, team, online = true) => ({ id, name: id, team, online });
const seq = (ps, k) => { let t = { team: 1, n: { 1: 0, 2: 0 } }; const o = []; for (let i = 0; i < k; i++) { o.push(T.mover(ps, t).id); t = T.advance(t); } return o; };

// rotation: 2v2, 3v1, 1v2 (the "opp1 - me - opp2 - me" case)
assert.deepStrictEqual(seq([P('a', 1), P('b', 2), P('c', 1), P('d', 2)], 6), ['a', 'b', 'c', 'd', 'a', 'b']);
assert.deepStrictEqual(seq([P('a', 1), P('b', 1), P('c', 1), P('d', 2)], 6), ['a', 'd', 'b', 'd', 'c', 'd']);
assert.deepStrictEqual(seq([P('a', 1), P('x', 2), P('y', 2)], 6), ['a', 'x', 'a', 'y', 'a', 'x']);
// offline member is skipped, team keeps its turn order
assert.deepStrictEqual(seq([P('a', 1), P('b', 2), P('c', 1, false), P('d', 2)], 4), ['a', 'b', 'a', 'd']);
// nobody online in the team to move -> null
assert.strictEqual(T.mover([P('a', 1, false), P('b', 2)], { team: 1, n: { 1: 0, 2: 0 } }), null);

// wipe detection
assert.deepStrictEqual(T.wiped([P('a', 1, false), P('b', 2)]), [1]);
assert.deepStrictEqual(T.wiped([P('a', 1), P('b', 2)]), []);
assert.deepStrictEqual(T.wiped([P('a', 1, false), P('b', 2, false)]), [1, 2]);

// team limits: 3:1 allowed, 4:0 not; start needs both teams
const full3 = [P('a', 1), P('b', 1), P('c', 1), P('d', 2)];
assert(!T.canPick(full3, 'd', 1), 'team 1 is full (3)');
assert(T.canPick(full3, 'a', 1), 'already-in member can re-pick own team');
assert(T.canPick([P('a', 1), P('b', 1)], 'b', 2));
assert(T.canStart(full3).ok);
assert(!T.canStart([P('a', 1), P('b', 1)]).ok);
assert(!T.canStart([P('a', 1), P('b', 2, false)]).ok);
assert.strictEqual(T.autoTeam([P('a', 1)]), 2);
assert.strictEqual(T.autoTeam([]), 1);
assert.strictEqual(T.autoTeam([P('a', 1), P('b', 1), P('c', 1)]), 2);

// host migration: next online player in join order, skipping old host; wraps on retry
const ps = [P('h', 1), P('a', 2), P('b', 1, false), P('c', 2)];
assert.strictEqual(T.successor(ps, 'h', 0).id, 'a');
assert.strictEqual(T.successor(ps, 'h', 1).id, 'c');
assert.strictEqual(T.successor(ps, 'h', 2).id, 'a');
assert.strictEqual(T.successor([P('h', 1)], 'h', 0), null);

// move validation
const empty = () => Array.from({ length: 15 }, () => Array(15).fill(0));
const turn = { team: 1, n: { 1: 0, 2: 0 } }, two = [P('a', 1), P('b', 2)];
assert(T.validMove({ row: 7, col: 7 }, empty(), false, turn, two, 'a'));
assert(!T.validMove({ row: 7, col: 7 }, empty(), false, turn, two, 'b'), 'wrong player');
assert(!T.validMove({ row: '7', col: 7 }, empty(), false, turn, two, 'a'));
assert(!T.validMove({ row: 15, col: 0 }, empty(), false, turn, two, 'a'));
assert(!T.validMove({ row: 7, col: 7 }, empty(), true, turn, two, 'a'), 'game over');
assert(!T.validMove({ row: 7, col: 7 }, empty(), false, null, two, 'a'), 'not started');
const occ = empty(); occ[7][7] = 2;
assert(!T.validMove({ row: 7, col: 7 }, occ, false, turn, two, 'a'));

// snapshot validation + name cleanup
const snap = { hostId: 'a', started: false, players: two, turn: null, board: empty(), scores: { 1: 0, 2: 0 } };
assert(T.validSnap(snap));
assert(!T.validSnap({ ...snap, board: 'x' }));
assert(!T.validSnap({ ...snap, players: [{ id: 1 }] }));
assert(!T.validSnap({ ...snap, turn: { team: 3, n: {} } }));
assert.strictEqual(T.cleanName('  hello   world  and more '), 'hello world');
assert.strictEqual(T.cleanName(null), '');
// time control
{
  const N5 = { k: 'n', main: 300000 }, NO = { k: 'n', main: 0 }, B5 = { k: 'b', per: 5000 };
  assert(T.validRule(N5) && T.validRule(NO) && T.validRule(B5) && T.validRule({ k: 'b', per: 10000 }));
  assert(!T.validRule({ k: 'b', per: 7000 }) && !T.validRule({ k: 'n', main: -1 }) && !T.validRule(null));
  const c = T.clockInit(N5);
  assert.deepStrictEqual(c, { main: 300000, per: 3 });
  assert.strictEqual(T.budget(N5, c), 300000 + 3 * 30000);
  assert.deepStrictEqual(T.spend(N5, c, 1000), { main: 299000, per: 3 }, 'main time');
  const z = { main: 0, per: 3 };
  assert.deepStrictEqual(T.spend(N5, z, 29999), z, 'byo-yomi period kept if not used up');
  assert.deepStrictEqual(T.spend(N5, z, 30000), { main: 0, per: 2 }, 'one period used up');
  assert.deepStrictEqual(T.spend(N5, { main: 10000, per: 3 }, 75000), { main: 0, per: 1 }, 'main 10s + 2 periods');
  assert.strictEqual(T.spend(N5, { main: 0, per: 1 }, 30000), null, 'last period gone = lose');
  assert.strictEqual(T.spend(B5, T.clockInit(B5), 4999) !== null, true);
  assert.strictEqual(T.spend(B5, T.clockInit(B5), 5000), null, 'blitz: 5s = lose');
  assert.strictEqual(T.budget(NO, T.clockInit(NO)), Infinity, 'no limit');
  assert.deepStrictEqual(T.view(N5, { main: 10000, per: 3 }, 4000), { main: 6000 });
  assert.deepStrictEqual(T.view(N5, { main: 10000, per: 3 }, 45000), { byo: 25000, per: 2 });
  assert.deepStrictEqual(T.view(B5, T.clockInit(B5), 1200), { byo: 3800, per: 0 });
  assert(T.validClock(c) && !T.validClock({ main: 1, per: 9 }));
}
// bestWindow: most own stones in any 5-cell line with no opponent stone (-1 = none left)
{
  const B = () => Array.from({ length: 15 }, () => Array(15).fill(0));
  assert.strictEqual(T.bestWindow(B(), 1), 0, 'empty board');
  const full = B().map((r, i) => r.map((_, j) => ((i >> 1) + j) % 2 + 1)); // 2x1 blocks: no 5 in a row anywhere
  assert.strictEqual(T.bestWindow(full, 1), -1, 'full board');
  assert.strictEqual(T.bestWindow(full, 2), -1);
  const g = full.map(r => r.slice()); g[7][7] = g[0][0] = 0; // empty cells left, still no open line for either side
  assert.strictEqual(T.bestWindow(g, 1), -1, 'blocked board with empty cells (black)');
  assert.strictEqual(T.bestWindow(g, 2), -1, 'blocked board with empty cells (white)');
  const one = B().map(r => r.map(() => 2)); one[0][0] = 0; one[0][1] = 1; // white owns all, a black stone blocks some
  assert.strictEqual(T.bestWindow(one, 1), -1, 'black blocked everywhere');
  assert.strictEqual(T.bestWindow(one, 2), 5, 'white still has open lines');
  const s = B(); s[7][7] = s[7][8] = s[7][9] = 1; s[7][10] = 2;
  assert.strictEqual(T.bestWindow(s, 1), 3);
  assert.strictEqual(T.bestWindow(s, 2), 1);
}
// voteAsk: who must agree; online only, proposer excluded
{
  const ps = [P('a', 1), P('b', 2), P('c', 1), P('d', 2), P('e', 1, false), P('f', 2, false)];
  assert.deepStrictEqual(T.voteAsk(ps, 'draw', 'a'), ['b', 'c', 'd'], 'draw: everyone online but the proposer, both teams');
  assert.deepStrictEqual(T.voteAsk(ps, 'resign', 'a'), ['c'], 'resign: online teammates only (offline e excluded)');
  assert.deepStrictEqual(T.voteAsk(ps, 'resign', 'b'), ['d'], 'offline f excluded');
  const solo = [P('a', 1), P('b', 2), P('c', 2)];
  assert.deepStrictEqual(T.voteAsk(solo, 'resign', 'a'), [], 'solo team: nobody to ask');
  assert.deepStrictEqual(T.voteAsk(solo, 'draw', 'a'), ['b', 'c']);
  assert.deepStrictEqual(T.voteAsk(ps, 'draw', 'zz'), [], 'unknown proposer');
}
console.log('team tests passed');
