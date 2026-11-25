// Team-mode E2E: 4 browsers, needs network (public PeerJS broker). Run: npm run test:team
import { chromium } from 'playwright';
const url = new URL('../index.html', import.meta.url).href;
const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exitCode = 1; };
const mk = async (name, rule) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); p.ctx = ctx; p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(url); await p.click('#mode-overlay .mode-card >> nth=1'); await p.click(`#rule-overlay .mode-card >> nth=${rule === 'b' ? 1 : 0}`); await p.fill('#team-name', name); return p;
};
const join = async (p, code) => { await p.fill('#team-code', code); await p.evaluate(() => teamJoin()); await p.waitForFunction(() => TM && TM.joined, null, { timeout: 20000 }); };
const players = (p) => p.evaluate(() => TM.players.map(x => `${x.name}:${x.team}:${x.online ? 1 : 0}`).join(','));
const W = { timeout: 25000 };
const H = await mk('Host'), A = await mk('Ann'), B = await mk('Bob'), C = await mk('Cat');
try {
  await H.evaluate(() => teamCreate(1)); await H.waitForFunction(() => TM && TM.joined, null, W);
  const code = await H.evaluate(() => TM.code); ok('code ' + code, /^[A-Z2-9]{6}$/.test(code));
  ok('host on black team', (await players(H)) === 'Host:1:1');
  ok('start disabled with one team', await H.evaluate(() => document.getElementById('team-start').disabled));
  await join(A, code); await join(B, code);
  await H.waitForFunction(() => TM.players.length === 3, null, W);
  ok('3/4 shown', (await H.textContent('#team-count')) === '3/4' && (await B.textContent('#team-count')) === '3/4');
  ok('auto-balance Host+Bob vs Ann', (await players(H)) === 'Host:1:1,Ann:2:1,Bob:1:1');
  ok('guest has no start button', await A.evaluate(() => getComputedStyle(document.getElementById('team-start')).display === 'none'));
  ok('start enabled at 3/4', await H.evaluate(() => !document.getElementById('team-start').disabled));
  // 3:1 allowed: Ann -> black makes 3:0 (start blocked), Cat joins white
  await A.evaluate(() => teamPick(1)); await H.waitForFunction(() => TM.players[1].team === 1, null, W);
  ok('3:0 cannot start', await H.evaluate(() => document.getElementById('team-start').disabled));
  await join(C, code); await H.waitForFunction(() => TM.players.length === 4, null, W);
  ok('4/4 + 3:1 layout', (await players(H)) === 'Host:1:1,Ann:1:1,Bob:1:1,Cat:2:1' && (await H.textContent('#team-count')) === '4/4');
  await C.evaluate(() => teamPick(1)); await C.waitForTimeout(800);
  ok('full team (3) rejects 4th', (await players(H)).endsWith('Cat:2:1'));
  const late = await mk('Late'); await late.fill('#team-code', code); await late.evaluate(() => teamJoin());
  await late.waitForFunction(() => document.getElementById('team-status').textContent.includes('가득'), null, W); ok('5th player rejected', true);
  await late.ctx.close();
  await H.evaluate(() => teamStart());
  for (const p of [H, A, B, C]) await p.waitForFunction(() => TM.started && !document.getElementById('team-overlay').classList.contains('show'), null, W);
  ok('all started, lobby closed', true);
  // rotation: black team Host, Ann, Bob alternate; white = Cat
  const mv = async (r, c) => { const who = [H, A, B, C]; for (const p of who) if (!p.isClosed() && await p.evaluate(() => tmMyTurn())) { await p.evaluate(([r, c]) => handleClick(r, c), [r, c]); return p; } throw new Error('nobody can move'); };
  const order = [];
  for (let i = 0; i < 6; i++) { const p = await mv(7 + (i % 2 ? 1 : 0), i); order.push(await p.evaluate(() => TM.name)); await H.waitForFunction(n => board.flat().filter(Boolean).length === n, i + 1, W); }
  ok('rotation ' + order, order.join() === 'Host,Cat,Ann,Cat,Bob,Cat');
  ok('moves synced', await C.evaluate(() => board.flat().filter(Boolean).length === 6));
  // out-of-turn / invalid moves ignored
  await C.evaluate(() => tmSend({ type: 'move', row: 0, col: 0 })); await B.evaluate(() => tmSend({ type: 'move', row: 99, col: 0 })); await H.waitForTimeout(800);
  ok('invalid moves ignored', await H.evaluate(() => board[0][0] === 0 && board.flat().filter(Boolean).length === 6));
  // teammate leaves: game continues, offline member skipped
  await B.ctx.close();
  await H.waitForFunction(() => TM.players[2].online === false, null, W);
  ok('game continues after teammate leaves', await H.evaluate(() => !gameOver && TM.started));
  ok('count shows 3/4', (await H.textContent('#conn-text')).includes('3/4'));
  // host leaves -> next online player (Ann) becomes host
  await H.ctx.close();
  await A.waitForFunction(() => TM.role === 'host' && TM.joined, null, { timeout: 40000 }); ok('Ann became host', true);
  await C.waitForFunction(() => TM.hostId === TM.players.find(p => p.name === 'Ann').id && !TM.migr, null, { timeout: 40000 }); ok('Cat reconnected to new host', true);
  ok('state preserved after migration', await C.evaluate(() => board.flat().filter(Boolean).length === 6 && TM.started));
  // new host can still run the game: whoever is to move plays
  const p2 = await mv(10, 10); await A.waitForFunction(() => board[10][10] !== 0, null, W); ok('moves work under new host', true);
  // white team (Cat only) leaves: 30s countdown, then black wins
  await C.ctx.close();
  await A.waitForFunction(() => /초 후 패배/.test(document.getElementById('team-banner').textContent), null, W); ok('countdown shown', true);
  await A.waitForFunction(() => gameOver && TM.result && TM.result.winner === 1, null, { timeout: 45000 }); ok('wiped team loses', true);
  ok('win overlay names team', await A.waitForFunction(() => document.getElementById('modal-winner').textContent.includes('흑팀 승리'), null, W).then(() => true));
  ok('no page errors', A.errs.length + H.errs.length + B.errs.length + C.errs.length === 0);
  // 1:1 blitz room (5s): host picks it, guest gets the rule; nobody moves -> black loses on time
  const X = await mk('Xa', 'b'), Y = await mk('Yu');
  await X.evaluate(() => teamCreate(1)); await X.waitForFunction(() => TM && TM.joined, null, W);
  await join(Y, await X.evaluate(() => TM.code)); await X.waitForFunction(() => TM.players.length === 2, null, W);
  ok('1:1 room can start', await X.evaluate(() => !document.getElementById('team-start').disabled));
  ok('guest sees room rule', (await Y.textContent('#team-rule')) === '속기전 · 한 수 5초');
  await X.evaluate(() => teamStart()); await Y.waitForFunction(() => TM.started && CLK, null, W);
  ok('guest shows blitz clock', /⚡/.test(await Y.textContent('#clock-1')));
  await Y.waitForFunction(() => gameOver && TM.result && TM.result.winner === 2 && TM.result.reason === 'time', null, { timeout: 15000 }); ok('blitz timeout: black loses', true);
  ok('loser sees time-out text', await X.waitForFunction(() => document.getElementById('modal-sub').textContent === '시간 초과로 졌습니다.', null, W).then(() => true));
  ok('no page errors (blitz)', X.errs.length + Y.errs.length === 0);
  // votes: 2v2 (black: Vh host + Vy, white: Vz + Vw). Host answers through the same path.
  const Vh = await mk('Vh'), Vy = await mk('Vy'), Vz = await mk('Vz'), Vw = await mk('Vw');
  const V = [Vh, Vy, Vz, Vw];
  for (const p of V) p.on('dialog', d => d.accept());
  await Vh.evaluate(() => teamCreate(1)); await Vh.waitForFunction(() => TM && TM.joined, null, W);
  const vc = await Vh.evaluate(() => TM.code);
  for (const p of [Vy, Vz, Vw]) await join(p, vc);
  await Vh.waitForFunction(() => TM.players.length === 4, null, W);
  await Vy.evaluate(() => teamPick(1)); await Vz.evaluate(() => teamPick(2));
  await Vh.waitForFunction(() => TM.players.map(p => p.team).join() === '1,1,2,2', null, W);
  const start = async (ps) => { await Vh.evaluate(() => teamStart()); for (const p of ps) await p.waitForFunction(() => TM.started && !gameOver, null, W); };
  const asked = (p) => p.waitForFunction(() => TM.vq && !document.getElementById('vote-btns').hidden && !document.getElementById('vote-box').hidden, null, W);
  const noVote = (ps) => Promise.all(ps.map(p => p.waitForFunction(() => !TM.vq && document.getElementById('vote-box').hidden, null, W)));
  const prog = (ps, t) => Promise.all(ps.map(p => p.waitForFunction(t => document.getElementById('vote-text').textContent.includes(t), t, W))).then(() => true, () => false);
  const btns = (p) => p.evaluate(() => !document.getElementById('vote-btns').hidden);
  await start(V);
  await Vh.waitForFunction(() => !document.getElementById('btn-draw').disabled, null, W);
  ok('off-turn player: both buttons shown and usable', await Vz.waitForFunction(() => { const d = document.getElementById('btn-draw'), r = document.getElementById('btn-resign'); return !d.hidden && !d.disabled && !r.hidden && !r.disabled; }, null, W).then(() => true, () => false));
  // 1) draw: everyone else asked at once, progress 1/4 -> 2/4 -> 3/4 -> pass
  await Vh.evaluate(() => offerDraw());
  for (const p of [Vy, Vz, Vw]) await asked(p);
  ok('draw asks both teams at once, proposer has no buttons', !(await btns(Vh)));
  ok('progress 1/4 for everyone', await prog(V, '동의 1/4'));
  const inPanel = (p) => p.evaluate(() => { const b = document.getElementById('vote-box'), a = document.querySelector('.actions'); return !!b.closest('.panel') && !b.hidden && a.hidden && getComputedStyle(a).display === 'none' && !document.querySelector('.board-wrap').contains(b); });
  ok('vote box in the panel, action buttons hidden (voter + proposer)', (await inPanel(Vz)) && (await inPanel(Vh)));
  ok('vote text format', /^Vh님의 무승부 제안 · 동의 1\/4 \(\d+초\)$/.test(await Vz.textContent('#vote-text')));
  await Vy.evaluate(() => tmVoteReply(true)); ok('progress 2/4', await prog(V, '동의 2/4'));
  ok('answered player loses buttons', !(await btns(Vy)) && await btns(Vz));
  await Vz.evaluate(() => tmVoteReply(true)); ok('progress 3/4', await prog(V, '동의 3/4'));
  await Vw.evaluate(() => tmVoteReply(true));
  for (const p of V) await p.waitForFunction(() => gameOver && TM.result && TM.result.draw && TM.result.reason === 'agreed' && document.getElementById('modal-sub').textContent === '합의 무승부', null, W);
  ok('draw vote passed -> 합의 무승부 everywhere', true);
  await Vh.evaluate(() => tmRematch()); for (const p of V) await p.waitForFunction(() => !TM.started, null, W);
  await start(V);
  // 2) one opponent refuses: cancelled, game goes on
  await Vh.waitForFunction(() => !document.getElementById('btn-draw').disabled, null, W);
  await Vh.evaluate(() => offerDraw()); await asked(Vz);
  await Vy.evaluate(() => tmVoteReply(true)); await prog(V, '동의 2/4');
  await Vz.evaluate(() => tmVoteReply(false)); await noVote(V);
  ok('one opponent refuses -> cancelled, game goes on', await Vw.evaluate(() => !gameOver && TM.started));
  ok('action buttons back after the vote', (await Promise.all(V.map(p => p.evaluate(() => { const a = document.querySelector('.actions'); return !a.hidden && getComputedStyle(a).display !== 'none' && document.getElementById('vote-box').hidden && !document.getElementById('btn-resign').hidden; })))).every(Boolean));
  ok('proposer told who refused', await Vh.waitForFunction(() => document.getElementById('vote-note').textContent === 'Vz님이 무승부 제안을 거절했습니다 — 게임이 계속됩니다!', null, W).then(() => true, () => false));
  // 3) no answer within the (shortened) time: cancelled; that was the 2nd vote -> no more buttons
  await Vh.evaluate(() => { VOTE_MS = 1500; }); await Vh.waitForFunction(() => !document.getElementById('btn-draw').disabled, null, W);
  await Vh.evaluate(() => offerDraw()); await asked(Vy); await noVote(V);
  ok('vote timeout -> cancelled + notice', await Vh.evaluate(() => !gameOver && document.getElementById('vote-note').textContent.startsWith('응답이 없어')));
  ok('2 draws used -> draw disabled (still shown), resign still usable', await Vh.waitForFunction(() => { const d = document.getElementById('btn-draw'), r = document.getElementById('btn-resign'); return !d.hidden && d.disabled && !r.hidden && !r.disabled; }, null, W).then(() => true, () => false));
  ok('guest sees host-side count', await Vy.waitForFunction(() => TM.votes[TM.players[0].id] === 2, null, W).then(() => true, () => false));
  // 3b) off-turn draw offer works (white Vz while black is to move); host Vh refuses
  await Vz.waitForFunction(() => !document.getElementById('btn-draw').disabled, null, W);
  ok('off-turn draw offer starts a vote', await Vz.evaluate(() => { offerDraw(); return currentPlayer === 1; }) && await asked(Vh).then(() => true, () => false));
  ok('during a vote both buttons shown but disabled', await Vh.evaluate(() => { const d = document.getElementById('btn-draw'), r = document.getElementById('btn-resign'); return !d.hidden && d.disabled && r.disabled && r.title === '투표가 진행 중입니다'; }));
  await Vh.evaluate(() => tmVoteReply(false)); await noVote(V);
  // 4) resign asks only own teammates: Vy resigns, host Vh agrees (1/2 -> pass) -> white wins
  await Vh.evaluate(() => { VOTE_MS = 20000; });
  await Vy.waitForFunction(() => !document.getElementById('btn-resign').disabled, null, W); await Vy.evaluate(() => resign()); await asked(Vh);
  ok('resign progress 1/2', await prog(V, '동의 1/2'));
  ok('resign does not ask the other team', !(await btns(Vz)) && !(await btns(Vw)));
  await Vh.evaluate(() => tmVoteReply(true));
  for (const p of V) await p.waitForFunction(() => gameOver && TM.result && TM.result.winner === 2 && TM.result.reason === 'resign', null, W);
  ok('resign vote passed -> white wins', await Vz.waitForFunction(() => document.getElementById('modal-sub').textContent === '상대 팀이 항복했습니다!', null, W).then(() => true));
  ok('loser sees 항복', (await Vy.textContent('#modal-sub')) === '항복했습니다.');
  // 5) solo team: Vw leaves, Vz alone on white -> confirm only
  await Vw.ctx.close(); await Vh.waitForFunction(() => TM.players[3].online === false, null, W);
  await Vh.evaluate(() => tmRematch()); const V3 = [Vh, Vy, Vz];
  for (const p of V3) await p.waitForFunction(() => !TM.started && TM.players.length === 3, null, W);
  await start(V3); await Vz.waitForFunction(() => !document.getElementById('btn-resign').disabled, null, W); await Vz.evaluate(() => resign());
  for (const p of V3) await p.waitForFunction(() => gameOver && TM.result && TM.result.winner === 1 && TM.result.reason === 'resign', null, W);
  ok('solo resign: immediate loss', true);
  ok('no page errors (votes)', V.reduce((n, p) => n + p.errs.length, 0) === 0);
} catch (e) { console.error(e); process.exitCode = 1; for (const p of [A, C]) console.log(await p.evaluate(() => JSON.stringify({ role: TM.role, migr: TM.migr, busy: TM.busy, peer: !!TM.peer, conn: !!TM.conn, h: TM.hostId, p: TM.players.map(x => x.name + x.online) })).catch(e => String(e))); }
await b.close();
