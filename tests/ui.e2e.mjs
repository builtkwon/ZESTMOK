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
  // "다시 하기" after an AI game: colour picker again, titled with the same level and time; picking starts a fresh board
  await p.evaluate(()=>{gameOver=true;showWinOverlay(1);}); await p.click('#overlay .modal-btns .btn >> nth=0'); await p.waitForTimeout(500);
  const rm=await p.evaluate(()=>({sel:document.getElementById('select-overlay').classList.contains('show'),mode:document.getElementById('mode-overlay').classList.contains('show'),t:document.getElementById('select-title').textContent}));
  ok(name+' rematch opens colour picker (not mode select)', rm.sel&&!rm.mode); ok(name+' rematch title names the game', rm.t.startsWith('다시 하기 · 어려움 · ')); console.log('  title:',rm.t);
  ok(name+' rematch picker has 뒤로 -> home', await p.evaluate(()=>{selectBack();const h=document.getElementById('mode-overlay').classList.contains('show');hideOverlay('mode-overlay');showOverlay('select-overlay');return h;}));
  await p.click('#select-overlay .stone-choice >> nth=0'); await p.waitForTimeout(400);
  ok(name+' rematch started a new game', await p.evaluate(()=>!gameOver&&board.flat().filter(Boolean).length===0&&humanPlayer===1));
  // taps made before my turn began (queued during the AI's search) are dropped; later ones go through
  const tg=await p.evaluate(()=>{updateTurn();return {early:boardTap({timeStamp:turnAt-500}),grace:boardTap({timeStamp:turnAt+50}),late:boardTap({timeStamp:turnAt+TAP_GRACE+1})};});
  ok(name+' early tap dropped, later tap accepted', !tg.early&&!tg.grace&&tg.late);
  // hidden move order: after the result is closed, a board tap toggles numbers on the stones
  await p.evaluate(()=>{initBoard();doPlaceStone(7,7);doPlaceStone(7,8);doPlaceStone(8,8);gameOver=true;});
  ok(name+' no numbers before the result is closed', await p.evaluate(()=>{boardTap({timeStamp:1e12});return !stonesLayer.classList.contains('show-order');}));
  const od=await p.evaluate(()=>{closeOverlay();boardTap({timeStamp:1e12});const on=stonesLayer.classList.contains('show-order');const n=[...stonesLayer.querySelectorAll('.stone')].map(e=>e.dataset.n).join(',');boardTap({timeStamp:1e12});return {on,n,off:!stonesLayer.classList.contains('show-order')};});
  ok(name+' tap after game shows move order 1,2,3 and toggles off', od.on&&od.n==='1,2,3'&&od.off);
  // boss: refuses draw and resign, always
  const rf=await p.evaluate(()=>{setLevel('boss');gameOver=false;aiThinking=false;initBoard();board[7][5]=board[7][6]=board[7][7]=2;humanPlayer=1;aiPlayer=2;currentPlayer=1;ctlRender();offerDraw();const d=document.getElementById('vote-note').textContent;resign();return {d,r:document.getElementById('vote-note').textContent,over:gameOver};});
  ok(name+' boss refuses draw and resign', rf.d.includes('무승부를 거절')&&rf.r.includes('항복을 거절')&&!rf.over);
  ok(name+' boss takes a draw when it has no line left', await p.evaluate(()=>{aiVotes=0;initBoard();gameOver=false;ctlRender();offerDraw();const r=gameOver&&document.getElementById('modal-sub').textContent.includes('수가 안 보이나 보군');closeOverlay();gameOver=false;return r;}));
  // easter egg: boss about to make five -> 300 taps in 10 s flips the table (void game, same colours, score unchanged)
  const egg=async(n)=>{await p.evaluate(()=>{initBoard();scores={1:0,2:0};for(const c of [3,4,5,6])board[7][c]=2;for(const c of [3,4,5,6])board[9][c]=1;board[0][0]=1;refreshStones();currentPlayer=2;bossEgg({row:7,col:7});});
    ok(name+' egg: stone blinks + "300번 내리쳐라!"', await p.evaluate(()=>!!document.querySelector('.stone.egg-blink')&&document.querySelector('.egg').textContent.includes('300번 내리쳐라!')));
    await p.waitForTimeout(1300); ok(name+' egg: gauge full + "바둑판을 탭하세요!"', await p.evaluate(()=>['바둑판을 탭하세요!','클릭하거나 스페이스바를 누르세요!'].includes(document.querySelector('.egg-sub').textContent)&&document.querySelector('.egg-bar i').style.width==='100%')); await p.waitForTimeout(3000); await p.evaluate((n)=>{const u=document.querySelector('.egg');for(let i=0;i<n;i++)u.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));},n);};
  await egg(300); await p.waitForTimeout(4500);
  ok(name+' egg 300 taps: table flipped, new empty game, score unchanged', await p.evaluate(()=>!document.querySelector('.egg')&&!gameOver&&board.flat().every(v=>!v)&&scores[1]===0&&scores[2]===0&&humanPlayer===1));
  ok(name+' egg once per AI match: not again after the flip, not below boss', await p.evaluate(()=>{const n=document.querySelectorAll('.egg').length;const B=GomokuAI.bestMove;GomokuAI.bestMove=()=>({row:7,col:7});
    const run=()=>{initBoard();for(const c of [3,4,5,6])board[7][c]=2;for(const c of [3,4,5,6])board[9][c]=1;board[0][0]=1;refreshStones();gameOver=false;currentPlayer=2;doAiMove();};
    return new Promise(res=>{run();setTimeout(()=>{const again=!!document.querySelector('.egg');const won=gameOver;setLevel('hard');eggUsed=false;run();setTimeout(()=>{const hard=!!document.querySelector('.egg');GomokuAI.bestMove=B;setLevel('boss');res(!again&&won&&!hard&&n===0);},300);},300);});}));
  await p.evaluate(()=>{eggUsed=false;closeOverlay();gameOver=false;});
  if(name==='desktop'){ await egg(100); for(let i=0;i<10;i++) await p.keyboard.press('Space');
    ok(name+' egg: clicks + Space both count (110/300 -> gauge 63%)', await p.evaluate(()=>Math.round(parseFloat(document.querySelector('.egg-bar i').style.width))===63));
    await p.waitForTimeout(13000);
    ok(name+' egg 100 taps: boss laughs then wins', await p.evaluate(()=>!document.querySelector('.egg')&&gameOver&&board[7][7]===2&&scores[2]===1)); }
  await p.evaluate(()=>{closeOverlay();setLevel('hard');gameOver=false;aiThinking=false;initBoard();board[6][6]=1;board[7][7]=2;refreshStones();});
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
  ok(name+' AI refuses draw (has 3 in an open line) + notice', await p.evaluate(()=>!gameOver&&document.getElementById('vote-note').textContent==='AI가 무승부를 거절했습니다 — 게임이 계속됩니다!'));
  await p.click('#btn-draw'); await p.waitForTimeout(200);
  ok(name+' 2 offers per game: draw stays visible but disabled, resign untouched', await vis('btn-draw') && await vis('btn-resign') && await p.evaluate(()=>document.getElementById('btn-draw').disabled&&!document.getElementById('btn-resign').disabled));
  await p.evaluate(()=>{selectColor(1);board=board.map((r,i)=>r.map((_,j)=>((i>>1)+j)%2+1));board[7][7]=board[0][0]=0;refreshStones();updateTurn();}); await p.waitForTimeout(300);
  ok(name+' no-move notice, game goes on', await p.evaluate(()=>!gameOver&&document.getElementById('turn-text').textContent.includes('더 이상 둘 수가 없습니다')));
  ok(name+' draw button highlighted', await p.evaluate(()=>document.getElementById('btn-draw').classList.contains('hot')));
  await p.click('#btn-draw'); await p.waitForTimeout(300);
  ok(name+' AI accepts draw (no line left)', await p.evaluate(()=>gameOver&&document.getElementById('modal-winner').textContent==='무승부!'&&document.getElementById('modal-sub').textContent.includes('합의 무승부')));
  await p.evaluate(()=>{closeOverlay();selectColor(1);scores={1:0,2:0};aiHist=[{p:1,row:7,col:7,key:GomokuAI.posKey(board,1)}];board[7][7]=1;refreshStones();const L=GomokuAI.learn;GomokuAI.learn=(h,ai,w)=>{window.learned=[ai,w];return L(h,ai,w)};}); await p.waitForTimeout(200);
  await p.click('#btn-resign'); await p.waitForTimeout(300);
  ok(name+' resign: confirm, AI wins', dialogs.some(m=>m==='정말 항복할까요?') && await p.evaluate(()=>gameOver&&scores[2]===1&&document.getElementById('modal-sub').textContent==='항복했습니다'&&String(window.learned)==='2,2'));
  ok(name+' after the game: buttons shown, disabled with reason', await vis('btn-draw') && await p.evaluate(()=>{const d=document.getElementById('btn-draw'),r=document.getElementById('btn-resign');return d.disabled&&r.disabled&&r.title==='진행 중인 대국이 없습니다';}));
  await p.evaluate(()=>{closeOverlay();selectColor(1);aiThinking=true;ctlRender();});
  ok(name+' AI thinking: draw disabled', await p.evaluate(()=>document.getElementById('btn-draw').disabled&&document.getElementById('btn-draw').title==='AI가 생각 중입니다'));
  await p.evaluate(()=>{aiThinking=false;currentPlayer=2;ctlRender();});
  ok(name+' AI mode: draw usable on AI turn too', await p.evaluate(()=>!document.getElementById('btn-draw').disabled));
  await p.evaluate(()=>{currentPlayer=1;});
  // theme: <head> script sets data-theme before paint; toggle is usable from the mode screen
  ok(name+' theme set before scripts (follows OS, aria-pressed)', await p.evaluate(()=>{const t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';return document.documentElement.dataset.theme===t&&document.getElementById('theme-btn').getAttribute('aria-pressed')===String(t==='dark');}));
  // default stones = ZEST photos while no profile photo is set (board, ghost, panel, choice, result modal)
  ok(name+' no profile photo: stones use ZEST stone-black/white.jpg everywhere', await p.evaluate(()=>{
    if(!gameOver&&!board.flat().some(Boolean)){board[7][7]=1;board[7][8]=2;} refreshStones();
    const bg=(sel)=>[...document.querySelectorAll(sel)].map(e=>getComputedStyle(e).backgroundImage);
    const all=(sel,re)=>{const l=bg(sel);return l.length>0&&l.every(v=>re.test(v));};
    const modal=document.getElementById('modal-stone'); modal.className='modal-stone black-stone'; const mb=getComputedStyle(modal).backgroundImage; modal.className='modal-stone';
    const rs=document.documentElement.style;
    return all('.stone.black-stone',/stone-black\.jpg/)&&all('.stone.white-stone',/stone-white\.jpg/)&&all('.player-stone.black',/stone-black\.jpg/)&&all('.player-stone.white',/stone-white\.jpg/)&&all('.stone-choice-img.black',/stone-black\.jpg/)&&all('.stone-choice-img.white',/stone-white\.jpg/)&&/stone-black\.jpg/.test(mb)&&!rs.getPropertyValue('--stone-black-img')&&!rs.getPropertyValue('--stone-white-img');}));
  ok(name+' Galmuri on body + buttons, font loaded', await p.evaluate(async()=>{await document.fonts.ready;return [document.body,document.querySelector('.btn'),document.querySelector('.level-chip')].every(e=>getComputedStyle(e).fontFamily.startsWith('Galmuri11'))&&document.fonts.check('12px Galmuri11')&&document.fonts.check('700 12px Galmuri11')&&BOARD_FONT.includes('Galmuri11');}));
  const fsBad=await p.evaluate(()=>{const ok=new Set(['12px','24px','36px']);return [...document.querySelectorAll('body *')].filter(e=>e.textContent.trim()&&e.children.length===0&&!e.closest('script,style')&&!e.classList.contains('mode-icon')&&!e.classList.contains('sr-only')&&getComputedStyle(e).display!=='none'&&!ok.has(getComputedStyle(e).fontSize)).map(e=>e.tagName+'.'+e.className+':'+getComputedStyle(e).fontSize);});
  ok(name+' font sizes only 12/24/36px '+JSON.stringify(fsBad), fsBad.length===0);
  const fonts=await p.evaluate(()=>getComputedStyle(document.body).fontFamily); 
  ok(name+' no page errors '+JSON.stringify(errs), errs.length===0);
  await ctx.close();
}
{ // photo stones: an uploaded photo overrides only my color in AI mode; clearing it restores the ZEST photos
  const ctx=await b.newContext({viewport:{width:1280,height:800}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); await p.goto(url); await p.waitForTimeout(300);
  const png=Buffer.from((await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=200;const x=c.getContext('2d');x.fillStyle='#3a7bd5';x.fillRect(0,0,200,200);x.fillStyle='#f4b942';x.beginPath();x.arc(100,100,60,0,7);x.fill();return c.toDataURL('image/png').split(',')[1];})),'base64');
  await p.click('#profile-btn'); ok('profile menu opens: upload + hide, no clear yet', await p.evaluate(()=>!document.getElementById('profile-menu').hidden&&document.getElementById('pm-clear').hidden&&document.getElementById('pm-hide').getAttribute('aria-pressed')==='false'));
  await p.setInputFiles('#pm-file',{name:'t.png',mimeType:'image/png',buffer:png}); await p.waitForFunction(()=>Profile.hasUpload(),null,{timeout:8000});
  ok('upload saved under zestmok-profile (valid avatar)', await p.evaluate(()=>{const o=JSON.parse(localStorage.getItem('zestmok-profile'));return TeamLogic.validAvatar(o.upload)&&!localStorage.getItem('ohohmok-profile');}));
  await p.keyboard.press('Escape');
  await p.click('#mode-overlay .mode-card >> nth=0'); await p.waitForTimeout(400); await p.click('#rule-overlay .mode-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.stone-choice >> nth=0'); await p.waitForTimeout(600);
  await p.evaluate(()=>{board[7][7]=1;board[7][8]=2;refreshStones();});
  const bg=(sel)=>p.evaluate(sel=>getComputedStyle(document.querySelector(sel)).backgroundImage,sel);
  ok('my photo on my color only: board + panel', /^url\("data:image/.test(await bg('.stone.black-stone'))&&/^url\("data:image/.test(await bg('.player-stone.black'))&&/stone-white\.jpg/.test(await bg('.stone.white-stone'))&&/stone-white\.jpg/.test(await bg('.player-stone.white')));
  await p.evaluate(()=>{Profile.clearUpload();});
  ok('clear photo: ZEST stones back, variables removed', /stone-black\.jpg/.test(await bg('.stone.black-stone'))&&/stone-black\.jpg/.test(await bg('.player-stone.black'))&&await p.evaluate(()=>!document.documentElement.style.getPropertyValue('--stone-black-img')));
  ok('no page errors (photo block) '+JSON.stringify(errs), errs.length===0);
  await ctx.close();
}
{ // room avatar relay: host validates, rate-limits to 1/s and sends the latest at the end of the window
  const ctx=await b.newContext(); const p=await ctx.newPage(); await p.goto(url); await p.waitForTimeout(200);
  const r=await p.evaluate(async()=>{
    const sent=[]; const fake={open:true,send:m=>sent.push(m)};
    TM={role:'host',me:'hh',conns:{gg:fake},players:[{id:'hh',team:1,online:true,name:'h'},{id:'gg',team:2,online:true,name:'g'}],av:{},avAt:{},stones:'',started:false,joined:false,until:{},votes:{},rule:RULE};
    const A='data:image/png;base64,AAAA', B='data:image/png;base64,BBBB', C='data:image/png;base64,CCCC';
    tmHostAvatar('gg','javascript:alert(1)'); const bad=sent.length;
    tmHostAvatar('gg',A); tmHostAvatar('gg',B); tmHostAvatar('gg',C);
    const first=sent.filter(m=>m.type==='avatar').map(m=>m.src); await new Promise(r=>setTimeout(r,1150));
    const after=sent.filter(m=>m.type==='avatar').map(m=>m.src); tmAvatarOff('gg'); tmHostAvatar('gg',A);
    const off=sent.filter(m=>m.type==='avatar').map(m=>m.src); TM=null; return {bad,first,after,off};});
  ok('avatar relay: invalid dropped, 1/s, latest sent at window end', r.bad===0&&r.first.length===1&&r.first[0].endsWith('AAAA')&&r.after.length===2&&r.after[1].endsWith('CCCC'));
  ok('host "사진 끄기": src null relayed, later avatars ignored', r.off.length===3&&r.off[2]===null);
  await ctx.close();
}
await b.close();
