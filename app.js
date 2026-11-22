import {Flight,W,H,STAGES,DIFFICULTIES} from './engine.js';
import {ArcadeAudio} from './sound.js?v=2';
import {Renderer} from './draw.js';

const $=id=>document.getElementById(id);
const body=document.body,screen=$('screen'),canvas=$('game'),modal=$('modal');
const difficultyKey='pulse.neon-striker.difficulty.v1', soundKey='pulse.neon-striker.sound.v1';
function readSetting(k){try{return localStorage.getItem(k);}catch{return null;}}
function writeSetting(k,v){try{localStorage.setItem(k,String(v));}catch{/* Private browsing may restrict storage. */}}
const selector=$('difficulty');
const lastDifficulty=Number(readSetting(difficultyKey));
let difficulty=Number.isInteger(lastDifficulty) && DIFFICULTIES[lastDifficulty-1] ? lastDifficulty : 1;
for(const [i,setting] of DIFFICULTIES.entries()){
  selector.add(new Option('第 '+(i+1)+' 級 · '+setting.name, String(i+1)));
}
selector.value=String(difficulty);
function recordKey(){
  const original='pulse.neon-striker.best.v1';
  return difficulty===1 ? original : original+'.'+difficulty;
}
function readBest() {
  const value=Number(readSetting(recordKey()));
  return Number.isSafeInteger(value) && value>=0 ? value : 0;
}
let best=readBest();
let bestBefore=best, dialog='',helpBack='',pointer=null,target=null,lastHud=-1;
let fallbackFull=false,priorFrame=0,accum=0,notifyFocus=null;
const keys=new Set(),fmt=n=>String(Math.floor(n)).padStart(7,'0');
const audio=new ArcadeAudio(readSetting(soundKey)!=='off');
const renderer=new Renderer(canvas);
const run=new Flight(handleEvent);
const mobile=matchMedia('(pointer:coarse), (max-width:900px)');
const route=[...document.querySelectorAll('#route li')];
const announce=text=>{$('announcement').textContent=text;};
const active=()=>run.mode==='playing'||run.mode==='clearing';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
screen.tabIndex=-1;
function buildPips(id,group) {
  const el=$(id);
  for(let i=0;i<3;i++){const icon=document.createElement('i');icon.className='icon';icon.setAttribute('aria-hidden','true');el.append(icon);}
  return n=>{
    [...el.children].forEach((v,i)=>v.classList.toggle('spent',i>=n));
    el.setAttribute('aria-label',group+' '+n);
  };
}
const setLives=buildPips('lifePips','剩餘機體'),setHudLives=buildPips('hudLives','剩餘機體'),setBombs=buildPips('bombPips','脈衝炸彈');
function persistBest(){
  const stored=readBest();
  best=Math.max(stored,best,run.score);
  if(best>stored)writeSetting(recordKey(),best);
}
function clearInput() {
  keys.clear();target=null;
  if(pointer && screen.hasPointerCapture?.(pointer.id))screen.releasePointerCapture(pointer.id);
  pointer=null;
}
function setText(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
function syncHud() {
  best=Math.max(best,run.score);
  setText('score',fmt(run.score));setText('hudScore',fmt(run.score));setText('best',fmt(best));setText('titleBest',fmt(best));
  setText('level','LV.'+run.level);setText('hudBomb',String(run.bombs));
  setLives(run.lives);setHudLives(run.lives);setBombs(run.bombs);
  const bomb=$('hudBomb').parentElement;bomb.disabled=run.bombs<=0||run.mode!=='playing';
  bomb.setAttribute('aria-label','施放脈衝炸彈，剩餘 '+run.bombs+' 枚');
  setText('sectorCount','0'+(run.stage+1)+' / 03');
  route.forEach((li,i)=>{
    li.classList.toggle('current',i===run.stage);
    li.classList.toggle('done',i<run.stage||run.mode==='won');
    if(i===run.stage)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');
  });
  $('bossGauge').hidden=!run.boss;
  if(run.boss){setText('bossName',STAGES[run.stage].boss);$('bossHp').style.transform='scaleX('+(run.boss.hp/run.boss.max)+')';}
  const hint=$('flightHint'),show=run.stage===0&&run.stageTime>2.55&&run.stageTime<7.4&&run.mode==='playing';
  hint.hidden=!show;
  if(show)hint.textContent=mobile.matches?'拖曳戰機移動 · 右下角施放炸彈':'方向鍵或 WASD 移動 · 空白鍵炸彈';
  const status=run.mode==='title'?'待機中':dialog==='pause'||dialog==='help'?'已暫停':run.mode==='over'?'本局結束':run.mode==='won'?'任務完成':run.mode==='clearing'?'空域突破':'出擊中';
  setText('cabinetStatus',status);
}
function syncSound() {
  body.classList.toggle('muted',!audio.enabled);
  for(const btn of document.querySelectorAll('[data-action="sound"]')){
    btn.setAttribute('aria-label',audio.enabled?'關閉聲音':'開啟聲音');
    btn.setAttribute('aria-pressed',String(audio.enabled));
    const text=btn.querySelector('.sound-label');if(text)text.textContent=audio.enabled?'聲音開啟':'聲音關閉';
  }
}
function toggleSound() {
  const on=!audio.enabled;
  if(on)audio.unlock();
  audio.setEnabled(on);writeSetting(soundKey,on?'on':'off');
  if(on){audio.effect('ui');if(run.mode==='playing'&&!dialog)audio.music(run.stage,!!run.boss);}
  syncSound();
  const inline=modal.querySelector('[data-action="sound"]');if(inline)inline.textContent=on?'聲音開啟':'聲音關閉';
}
function fullElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
function syncFull() {
  const on=!!fullElement()||fallbackFull;
  body.classList.toggle('focus-screen',on);
  for(const b of document.querySelectorAll('[data-action="full"]')){
    b.setAttribute('aria-label',on?'退出全螢幕':'進入全螢幕');b.setAttribute('aria-pressed',String(on));
    const label=b.querySelector('.full-label');if(label)label.textContent=on?'退出全螢幕':'全螢幕';
    if(b.closest('#dialogActions'))b.textContent=on?'退出全螢幕':'全螢幕';
  }
}
async function toggleFull() {
  try {
    if(fullElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);}
    else if(fallbackFull)fallbackFull=false;
    else{
      const request=screen.ownerDocument.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
      if(request)await request.call(document.documentElement);else fallbackFull=true;
    }
  } catch {fallbackFull=!fullElement()&&!fallbackFull;}
  syncFull();
}
document.addEventListener('fullscreenchange',syncFull);
document.addEventListener('webkitfullscreenchange',syncFull);
function button(label,action,kind='') {
  const b=document.createElement('button');b.type='button';b.dataset.action=action;b.className=kind;b.textContent=label;return b;
}
function row(parent,left,right,cls=''){
  const line=document.createElement('div'),a=document.createElement(parent.className==='help-grid'?'b':'span'),b=document.createElement(parent.className==='help-grid'?'span':'strong');
  a.textContent=left;b.textContent=right;if(cls)b.className=cls;line.append(a,b);parent.append(line);
}
function showDialog(kind,kicker,heading,block,buttons) {
  if(!dialog)notifyFocus=document.activeElement;
  dialog=kind;clearInput();audio.stopMusic();
  $('dialogKicker').textContent=kicker;$('dialogTitle').textContent=heading;
  $('dialogBody').replaceChildren(...(block?[block]:[]));$('dialogActions').replaceChildren(...buttons);
  modal.hidden=false;
  const title=$('titleScreen');title.inert=true;$('hud').inert=true;
  buttons[0]?.focus({preventScroll:true});syncHud();syncSound();syncFull();
}
function closeDialog(restore=false) {
  const back=notifyFocus;notifyFocus=null;
  modal.hidden=true;dialog='';$('titleScreen').inert=false;$('hud').inert=false;
  clearInput();priorFrame=0;accum=0;
  if(restore&&back?.isConnected&&!modal.contains(back))back.focus({preventScroll:true});
  else if(active())screen.focus({preventScroll:true});
}
selector.addEventListener('change',()=>{
  if(run.mode!=='title')return;
  difficulty=Number(selector.value);
  writeSetting(difficultyKey,difficulty);
  best=readBest();
  syncHud();
});
function start() {
  audio.unlock();bestBefore=best;audio.resetMusic();closeDialog();
  run.start(difficulty);body.dataset.mode='playing';$('hud').hidden=false;
  syncHud();screen.focus({preventScroll:true});
}
function resume() {
  if(!active())return;
  audio.unlock();closeDialog();if(run.mode==='playing')audio.music(run.stage,!!run.boss);syncHud();announce('繼續遊戲');
}
function pause() {
  if(!active())return;
  const stage=STAGES[run.stage],p=document.createElement('div');p.className='result-rows';
  row(p,'出擊難度',selector.selectedOptions[0].text);
  row(p,'目前空域','0'+(run.stage+1)+'　'+stage.name);
  row(p,'目前分數',fmt(run.score),'final-score');
  const settings=document.createElement('div');settings.className='dialog-settings';
  settings.append(button(audio.enabled?'聲音開啟':'聲音關閉','sound'),button(fullElement()||fallbackFull?'退出全螢幕':'全螢幕','full'));
  showDialog('pause','PAUSED','遊戲暫停',p,[button('繼續遊戲','resume','primary'),button('操作說明','help'),settings,button('結束本局','retire','plain')]);
  persistBest();announce('遊戲已暫停');
}
function help() {
  if(dialog==='help')return;
  helpBack=active()?'pause':dialog;
  const grid=document.createElement('div');grid.className='help-grid';
  row(grid,'手機','按住戰場任一處拖曳，戰機會跟著手指的位移移動。');
  row(grid,'電腦','方向鍵、WASD 或按住滑鼠拖曳移動。主砲自動連射。');
  row(grid,'炸彈','按空白鍵或點右下角閃電，可清除敵彈並重創敵機。');
  row(grid,'補給','拾取 P 提升主砲火力，最高三級。拾取 B 補充一枚炸彈。');
  row(grid,'暫停','按 P、Esc 或點右上角暫停鍵。');
  showDialog('help','HOW TO PLAY','操作說明',grid,[button(helpBack==='pause'?'返回暫停選單':'返回標題','back','primary')]);
}
function closeHelp() {if(helpBack==='pause')pause();else {closeDialog(true);syncHud();}}
function result(won,retired=false) {
  best=Math.max(best,run.score);const endWasRecord=run.score>bestBefore;persistBest();
  const r=document.createElement('div');r.className='result-rows';
  row(r,endWasRecord?'最高新紀錄':'最終分數',fmt(run.score),'final-score');
  row(r,'出擊難度',selector.selectedOptions[0].text);
  row(r,'擊破敵機',String(run.kills)+' 架');
  row(r,'抵達空域','0'+(run.stage+1)+'　'+STAGES[run.stage].name);
  body.dataset.mode=won?'won':'over';$('hud').hidden=true;
  showDialog(won?'won':'over',won?'ALL CLEAR':retired?'SORTIE END':'GAME OVER',won?'全空域突破':retired?'出擊結束':'任務結束',r,[button('再玩一次','start','primary'),button('返回標題','title')]);
  announce((won?'全空域突破':'本局結束')+'，得分 '+run.score);
}
function title() {
  persistBest();audio.stopMusic();closeDialog();run.reset();body.dataset.mode='title';body.style.removeProperty('--ambient-scene');$('hud').hidden=true;syncHud();announce('已返回標題');
  $('titleScreen').querySelector('[data-action="start"]').focus({preventScroll:true});
}
function handleEvent(e,data) {
  switch(e){
    case 'stage':body.style.setProperty('--ambient-scene','url(assets/stage'+(data+1)+'.webp)');clearInput();if(!dialog)audio.music(data,false);announce('第 '+(data+1)+' 關，'+STAGES[data].name);break;
    case 'boss':audio.effect('boss');audio.music(run.stage,true);announce('頭目出現，'+STAGES[run.stage].boss);break;
    case 'clear':audio.stopMusic();audio.effect('clear');best=Math.max(best,run.score);persistBest();announce('空域突破');break;
    case 'over':audio.stopMusic();audio.effect('over');result(false);break;
    case 'won':audio.stopMusic();audio.effect('won');result(true);break;
    case 'respawn':clearInput();announce('戰機重生，剩餘 '+run.lives+' 架');break;
    default:audio.effect(e);
  }
}
function action(name) {
  switch(name){
    case 'sound':toggleSound();break;
    case 'full':toggleFull();break;
    case 'start':if(!active())start();break;
    case 'title':title();break;
    case 'help':help();break;
    case 'pause':if(!dialog)pause();break;
    case 'back':closeHelp();break;
    case 'resume':resume();break;
    case 'bomb':if(!dialog&&run.bomb())syncHud();break;
    case 'retire':if(active()){run.mode='over';result(false,true);}break;
  }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  if(dialog&&!modal.contains(b)&&!['full','sound','help'].includes(b.dataset.action))return;
  action(b.dataset.action);
});
const movement=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
window.addEventListener('keydown',e=>{
  const k=e.code;
  if(e.metaKey||e.ctrlKey||e.altKey||e.target===selector)return;
  if(k==='Tab'&&dialog) {
    const b=[...modal.querySelectorAll('button:not(:disabled)')],first=b[0],last=b[b.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    return;
  }
  if(k==='KeyM'&&!e.repeat){e.preventDefault();toggleSound();return;}
  if(k==='Escape'&&!e.repeat) {
    e.preventDefault();
    if(dialog==='help')closeHelp();
    else if(dialog==='pause')resume();
    else if(active())pause();
    else if(fallbackFull){fallbackFull=false;syncFull();}
    return;
  }
  if(k==='KeyP'&&active()) {
    e.preventDefault();if(e.repeat)return;
    if(dialog==='pause')resume();else if(!dialog)pause();return;
  }
  if(k==='Enter'||k==='NumpadEnter') {
    if(e.repeat){e.preventDefault();return;}
    if(document.activeElement?.closest('button'))return;
    e.preventDefault();
    if(dialog==='help')closeHelp();else if(dialog==='pause')resume();else if(!active())start();
    return;
  }
  if(!active()||dialog)return;
  if(movement.has(k)){e.preventDefault();keys.add(k);target=null;return;}
  if(k==='Space'){e.preventDefault();if(!e.repeat&&run.bomb())syncHud();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function point(e) {
  const r=screen.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};
}
document.querySelector('.cockpit').addEventListener('pointerdown',e=>{
  if(!screen.contains(e.target)&&!mobile.matches&&!body.classList.contains('focus-screen'))return;
  if(!active()||dialog||pointer||e.target.closest('button,.modal')||e.button!==0)return;
  e.preventDefault();const p=point(e);
  pointer={id:e.pointerId,px:p.x,py:p.y,x:run.player.x,y:run.player.y,gain:e.pointerType==='mouse'?1:1.16};
  target={x:run.player.x,y:run.player.y};screen.setPointerCapture(e.pointerId);
});
screen.addEventListener('pointermove',e=>{
  if(!pointer||e.pointerId!==pointer.id||!active()||dialog)return;
  e.preventDefault();const p=point(e);
  // Integrate deltas against a clamped target so the craft leaves an edge as soon as the finger reverses.
  pointer.x=clamp(pointer.x+(p.x-pointer.px)*pointer.gain,16,W-16);
  pointer.y=clamp(pointer.y+(p.y-pointer.py)*pointer.gain,35,H-23);
  pointer.px=p.x;pointer.py=p.y;target={x:pointer.x,y:pointer.y};
});
function pointerEnd(e) {if(pointer?.id===e.pointerId)pointer=null;}
screen.addEventListener('pointerup',pointerEnd);screen.addEventListener('pointercancel',pointerEnd);screen.addEventListener('lostpointercapture',pointerEnd);
screen.addEventListener('contextmenu',e=>e.preventDefault());
function inactive() {if(active()&&!dialog)pause();clearInput();persistBest();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)inactive();});
window.addEventListener('storage',e=>{
  if(e.key===recordKey()){best=Math.max(best,readBest());syncHud();}
});
window.addEventListener('blur',inactive);window.addEventListener('pagehide',persistBest);
function loop(now) {
  const dt=priorFrame?Math.min(.10,Math.max(0,(now-priorFrame)/1000)):0;priorFrame=now;
  if(active()&&!dialog) {
    accum+=dt;
    const x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
    const y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
    while(accum>=1/60&&active()&&!dialog){run.step(1/60,{x,y,target});accum-=1/60;}
    renderer.draw(run);
    if(now-lastHud>85){syncHud();lastHud=now;}
  } else accum=0;
  requestAnimationFrame(loop);
}
syncSound();syncFull();syncHud();requestAnimationFrame(loop);
