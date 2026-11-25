// UI E2E (local, no network). Run: npm run test:ui
import { chromium, devices } from 'playwright';
const url=new URL('../index.html',import.meta.url).href;
const b=await chromium.launch({args:['--disable-features=WebRtcHideLocalIpsWithMdns']});
const ok=(n,c)=>{console.log(c?'PASS':'FAIL',n);if(!c)process.exitCode=1;};
for (const [name,opts] of [['desktop',{viewport:{width:1280,height:800}}],['mobile',{...devices['iPhone 13']}]]) {
  const ctx=await b.newContext(opts); const p=await ctx.newPage(); const errs=[],bad=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('response',r=>{if(r.status()>=400)bad.push(r.url())}); p.on('requestfailed',r=>bad.push(r.url()));
  const dialogs=[]; p.on('dialog',d=>{dialogs.push(d.message());d.message().includes('항복')?d.accept():d.dismiss()});
  await p.goto(url); await p.waitForTimeout(300);
  ok(name+' no external requests/failures', bad.length===0 && true); if(bad.length)console.log(bad);
  ok(name+' mode overlay focused', await p.evaluate(()=>document.activeElement.classList.contains('mode-card')));
  ok(name+' background inert', await p.evaluate(()=>document.querySelector('.game-layout').inert));
  ok(name+' hidden overlays not focusable', await p.evaluate(()=>['select-overlay','rule-overlay','team-overlay','overlay'].every(id=>getComputedStyle(document.getElementById(id)).visibility==='hidden')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(500); // AI card via keyboard
  ok(name+' rule step open (일반전/속기전, new! tag)', await p.evaluate(()=>document.getElementById('rule-overlay').contains(document.activeElement)&&document.querySelector('#rule-overlay .new-tag').textContent==='new!'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(500); // 일반전
  ok(name+' select dialog open + focus inside', await p.evaluate(()=>document.getElementById('select-overlay').contains(document.activeElement)));
  await p.click('.level-chip[data-level="hard"]');
  ok(name+' level hard checked', await p.evaluate(()=>document.querySelector('.level-chip[data-level=hard]').getAttribute('aria-checked')==='true'&&aiLevel==='hard'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  ok(name+' Esc back to rule step', await p.evaluate(()=>document.getElementById('rule-overlay').classList.contains('show')&&!document.getElementById('select-overlay').classList.contains('show')));
  await p.click('#rule-overlay .mode-card >> nth=0'); await p.waitForTimeout(400);
  ok(name+' 일반전 time chips: 없음 default', await p.evaluate(()=>[...document.querySelectorAll('#select-overlay [data-tc] .level-chip')].map(b=>b.textContent+(b.getAttribute('aria-checked')==='true'?'*':'')).join()==='없음*,5분,10분'));
  await p.click('.stone-choice >> nth=0'); await p.waitForTimeout(600);
  ok(name+' no clock without time limit', await p.evaluate(()=>!CLK&&document.getElementById('clock-1').textContent===''));
  ok(name+' game visible/not inert', await p.evaluate(()=>!document.querySelector('.game-layout').inert));
  ok(name+' badge text', (await p.textContent('#badge-white')).includes('AI · 어려움') && (await p.textContent('#badge-black'))==='나');
  await p.focus('#board-click'); await p.keyboard.press('Tab').catch(()=>{}); await p.focus('#board-click');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  const st=await p.evaluate(()=>({b:board[6][6],cnt:board.flat().filter(Boolean).length,live:document.getElementById('sr-live').textContent}));
  ok(name+' keyboard placed at (6,6) and AI replied', st.b===1&&st.cnt===2); console.log('  live:',st.live);
  await p.evaluate(()=>{gameOver=true;showWinOverlay(1);}); ok(name+' result title shows AI level', (await p.textContent('#overlay .modal-title'))==='AI 대전 · 어려움'); await p.evaluate(()=>{closeOverlay();gameOver=false;});
  await p.evaluate(()=>newGame()); ok(name+' confirm on leaving AI game', dialogs.some(m=>m.includes('종료')));
  ok(name+' still in game after cancel', await p.evaluate(()=>board.flat().filter(Boolean).length===2));
  await p.evaluate(()=>{scores={1:2,2:0};resetScore()}); ok(name+' confirm on score reset', dialogs.some(m=>m.includes('전적')));
  // 속기전 5초 vs AI: clock on the human only, timeout = loss
  await p.evaluate(()=>{gameOver=true;closeOverlay();newGame();}); await p.waitForTimeout(400);
  await p.click('#mode-overlay .mode-card >> nth=0'); await p.waitForTimeout(400); await p.click('#rule-overlay .mode-card >> nth=1'); await p.waitForTimeout(400);
  await p.click('#select-overlay [data-tc] .level-chip >> nth=0'); await p.click('.stone-choice >> nth=0'); await p.waitForTimeout(400);
  ok(name+' blitz clock shown for human only', /⚡ [45]\.\d초/.test(await p.textContent('#clock-1')) && (await p.textContent('#clock-2'))==='');
  await p.evaluate(()=>{CLK.t0-=6000;}); await p.waitForTimeout(400);
  ok(name+' blitz timeout = loss', await p.evaluate(()=>gameOver&&scores[2]===1&&document.getElementById('modal-winner').textContent==='시간 초과 패배'));
  // 일반전 5분: main time display
  await p.evaluate(()=>{closeOverlay();newGame();}); await p.waitForTimeout(400);
  await p.click('#mode-overlay .mode-card >> nth=0'); await p.waitForTimeout(400); await p.click('#rule-overlay .mode-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('#select-overlay [data-tc] .level-chip >> nth=1'); await p.click('.stone-choice >> nth=0'); await p.waitForTimeout(300);
  ok(name+' 5분 clock', /⏱ [45]:\d\d/.test(await p.textContent('#clock-1')));
  await p.evaluate(()=>{CLK.t0-=300500;}); await p.waitForTimeout(300);
  ok(name+' main time used up -> 초읽기', /초읽기 \d+초 · 3회/.test(await p.textContent('#clock-1')) && await p.evaluate(()=>!gameOver));
  // draw offer / resign vs AI (board set up directly)
  const vis=(id)=>p.evaluate(id=>!document.getElementById(id).hidden,id);
  await p.evaluate(()=>{closeOverlay();gameOver=true;selectColor(1);}); await p.waitForTimeout(300);
  ok(name+' draw + resign buttons on my turn', await vis('btn-draw') && await vis('btn-resign'));
  await p.evaluate(()=>{board[7][7]=board[7][8]=board[7][9]=2;board[3][3]=1;refreshStones();updateTurn();});
  await p.click('#btn-draw'); await p.waitForTimeout(200);
  ok(name+' AI refuses draw (has 3 in an open line)', await p.evaluate(()=>!gameOver&&document.getElementById('turn-text').textContent.includes('거절')));
  await p.click('#btn-draw'); await p.waitForTimeout(200);
  ok(name+' 2 offers per game, then buttons hidden', !(await vis('btn-draw')) && !(await vis('btn-resign')));
  await p.evaluate(()=>{selectColor(1);board=board.map((r,i)=>r.map((_,j)=>((i>>1)+j)%2+1));board[7][7]=board[0][0]=0;refreshStones();updateTurn();}); await p.waitForTimeout(300);
  ok(name+' no-move notice, game goes on', await p.evaluate(()=>!gameOver&&document.getElementById('turn-text').textContent.includes('더 이상 둘 수가 없습니다')));
  ok(name+' draw button highlighted', await p.evaluate(()=>document.getElementById('btn-draw').classList.contains('hot')));
  await p.click('#btn-draw'); await p.waitForTimeout(300);
  ok(name+' AI accepts draw (no line left)', await p.evaluate(()=>gameOver&&document.getElementById('modal-winner').textContent==='무승부!'&&document.getElementById('modal-sub').textContent.includes('합의 무승부')));
  await p.evaluate(()=>{closeOverlay();selectColor(1);scores={1:0,2:0};aiHist=[{p:1,row:7,col:7,key:GomokuAI.posKey(board,1)}];board[7][7]=1;refreshStones();const L=GomokuAI.learn;GomokuAI.learn=(h,ai,w)=>{window.learned=[ai,w];return L(h,ai,w)};}); await p.waitForTimeout(200);
  await p.click('#btn-resign'); await p.waitForTimeout(300);
  ok(name+' resign: confirm, AI wins', dialogs.some(m=>m==='정말 항복할까요?') && await p.evaluate(()=>gameOver&&scores[2]===1&&document.getElementById('modal-sub').textContent==='항복했습니다'&&String(window.learned)==='2,2'));
  await p.evaluate(()=>closeOverlay());
  const fonts=await p.evaluate(()=>getComputedStyle(document.body).fontFamily); 
  ok(name+' no page errors '+JSON.stringify(errs), errs.length===0);
  await ctx.close();
}
await b.close();
