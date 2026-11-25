// Room (PvP) + time control: pure logic (no DOM, no network). Tested in tests/team.test.js
// players: [{id, name, team: 1|2, online}] in join order. turn: {team: 1|2, n: {1: k, 2: k}}
(function (root) {
  const MAX_PLAYERS = 4, MAX_TEAM = 3, WIPE_MS = 10000, N = 15;
  const members = (ps, t) => ps.filter(p => p.team === t && p.online);

  // Who moves now: the team alternates; inside a team, online members rotate.
  function mover(players, turn) {
    const m = members(players, turn.team);
    return m.length ? m[turn.n[turn.team] % m.length] : null;
  }
  function advance(turn) {
    const n = { 1: turn.n[1], 2: turn.n[2] };
    n[turn.team]++;
    return { team: 3 - turn.team, n };
  }
  // Teams with nobody online (after this they have WIPE_MS to get someone back).
  const wiped = (ps) => [1, 2].filter(t => !members(ps, t).length);

  function canPick(ps, id, team) {
    return (team === 1 || team === 2) && ps.filter(p => p.team === team && p.id !== id).length < MAX_TEAM;
  }
  function canStart(ps) {
    const missing = [1, 2].find(t => !members(ps, t).length);
    return missing ? { ok: false, reason: (missing === 1 ? '흑' : '백') + '팀에 최소 1명이 필요합니다' } : { ok: true, reason: '' };
  }
  // Smaller team first (tie -> black), never a full one.
  function autoTeam(ps) {
    const c1 = ps.filter(p => p.team === 1).length, c2 = ps.filter(p => p.team === 2).length;
    return c1 <= c2 && c1 < MAX_TEAM ? 1 : 2;
  }
  // Host migration: k-th online non-host player in join order (k wraps).
  function successor(ps, hostId, k) {
    const c = ps.filter(p => p.id !== hostId && p.online);
    return c.length ? c[k % c.length] : null;
  }
  const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 12).trim();

  function validMove(msg, board, over, turn, players, fromId) {
    const m = turn && mover(players, turn);
    return !over && !!m && m.id === fromId && !!msg &&
      Number.isInteger(msg.row) && Number.isInteger(msg.col) &&
      msg.row >= 0 && msg.row < N && msg.col >= 0 && msg.col < N && board[msg.row][msg.col] === 0;
  }
  function validSnap(m) {
    const t = (v) => v === 1 || v === 2;
    return !!m && typeof m.hostId === 'string' && typeof m.started === 'boolean' &&
      Array.isArray(m.players) && m.players.length <= MAX_PLAYERS &&
      m.players.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && t(p.team) && typeof p.online === 'boolean') &&
      (m.turn === null || (m.turn && t(m.turn.team) && m.turn.n && Number.isInteger(m.turn.n[1]) && Number.isInteger(m.turn.n[2]))) &&
      Array.isArray(m.board) && m.board.length === N &&
      m.board.every(r => Array.isArray(r) && r.length === N && r.every(v => v === 0 || v === 1 || v === 2)) &&
      !!m.scores && Number.isInteger(m.scores[1]) && Number.isInteger(m.scores[2]);
  }

  // ── time control ──
  // rule: {k:'n', main:ms} 일반전 (main 0 = no limit; else main time, then BYO_N periods of BYO_MS 초읽기)
  //       {k:'b', per:ms}  속기전 (every move within per ms, else lose)
  // side clock: {main, per} = main time left, 초읽기 periods left
  const BYO_MS = 30000, BYO_N = 3;
  const validRule = (r) => !!r && ((r.k === 'n' && [0, 300000, 600000].includes(r.main)) || (r.k === 'b' && [5000, 10000].includes(r.per)));
  const clockInit = (r) => ({ main: r.k === 'n' ? r.main : 0, per: r.k === 'n' && r.main ? BYO_N : 0 });
  // ms the side to move may still use from turn start (Infinity = no limit)
  const budget = (r, c) => r.k === 'b' ? r.per : r.main ? c.main + c.per * BYO_MS : Infinity;
  // side clock after a move that took `used` ms, or null if it ran out
  function spend(r, c, used) {
    if (used >= budget(r, c)) return null;
    if (r.k === 'b' || !r.main) return c;
    if (used <= c.main) return { main: c.main - used, per: c.per };
    return { main: 0, per: c.per - Math.floor((used - c.main) / BYO_MS) }; // ponytail: a period is spent only when fully used up (Japanese byo-yomi)
  }
  // what to show `used` ms into the turn: {main} while in main time, else {byo: ms left in this period, per: periods left}
  function view(r, c, used) {
    if (r.k === 'b') return { byo: Math.max(0, r.per - used), per: 0 };
    if (used < c.main) return { main: c.main - used };
    const over = used - c.main;
    return { byo: Math.max(0, BYO_MS - (over % BYO_MS)), per: Math.max(0, c.per - Math.floor(over / BYO_MS)) };
  }
  const validClock = (c) => !!c && Number.isFinite(c.main) && c.main >= 0 && Number.isInteger(c.per) && c.per >= 0 && c.per <= BYO_N;

  // ── no-move check / votes ──
  // Most of p's stones in any 5-cell line holding no opponent stone; -1 = p can never make five.
  // ponytail: ignores black's forbidden moves (necessary condition only)
  function bestWindow(board, p) {
    let best = -1;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]])
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const er = r + 4 * dr, ec = c + 4 * dc;
        if (er >= N || ec < 0 || ec >= N) continue;
        let k = 0, open = true;
        for (let i = 0; i < 5 && open; i++) { const v = board[r + i * dr][c + i * dc]; if (v === p) k++; else if (v) open = false; }
        if (open && k > best) best = k;
      }
    return best;
  }
  // Who must agree (online only, proposer excluded): draw = everyone else, resign = own teammates.
  function voteAsk(players, kind, fromId) {
    const me = players.find(p => p.id === fromId);
    if (!me) return [];
    return players.filter(p => p.online && p.id !== fromId && (kind === 'draw' || p.team === me.team)).map(p => p.id);
  }

  const api = { MAX_PLAYERS, MAX_TEAM, WIPE_MS, mover, advance, wiped, canPick, canStart, autoTeam, successor, cleanName, validMove, validSnap, BYO_MS, BYO_N, validRule, clockInit, budget, spend, view, validClock, bestWindow, voteAsk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
