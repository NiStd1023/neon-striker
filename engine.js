export const W = 360;
export const H = 640;
export const STAGES = [
  { name: '暮光港灣', en: 'DUSK HARBOR', boss: '赤翼巡弋艦', tint: '#c59de4', music: 0 },
  { name: '翡翠裂谷', en: 'JADE RIFT', boss: '碧晶守衛', tint: '#8ed4be', music: 1 },
  { name: '天頂要塞', en: 'ZENITH KEEP', boss: '日蝕核心', tint: '#f39d93', music: 2 }
];
export const DIFFICULTIES = [
  { name: '新兵', shotSpeed: 1,    fireRate: 1,    waveRate: 1,    bossHealth: 1 },
  { name: '飛官', shotSpeed: 1.10, fireRate: 1.16, waveRate: 1.06, bossHealth: 1.10 },
  { name: '精英', shotSpeed: 1.20, fireRate: 1.34, waveRate: 1.13, bossHealth: 1.21 },
  { name: '王牌', shotSpeed: 1.32, fireRate: 1.54, waveRate: 1.21, bossHealth: 1.34 },
  { name: '傳奇', shotSpeed: 1.45, fireRate: 1.76, waveRate: 1.30, bossHealth: 1.50 }
];
const WAVES = [1.3, 4.7, 8.2, 11.7, 15, 18.7, 22, 25.5, 29, 32.5];
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rangeHit = (a, b, rx, ry) => ((a.x-b.x)/rx)**2 + ((a.y-b.y)/ry)**2 < 1;
const fiery = ['#fff1b0','#ffbd68','#f27864','#c34771','#80608f'];
const icy = ['#ddfffc','#80e8f4','#5fb9f2','#847ddd'];

export class Flight {
  constructor(emit = () => {}, random = Math.random) {
    this.emit = emit;
    this.random = random;
    this.reset();
  }
  reset() {
    this.mode = 'title';
    this.difficulty = DIFFICULTIES[0];
    this.stage = 0;
    this.score = this.kills = this.stageKills = this.wave = this.dropCount = 0;
    this.lives = this.bombs = 3;
    this.level = 1;
    this.time = this.stageTime = this.travel = this.shake = this.pulse = this.clearTime = 0;
    this.player = { x:180,y:535,lean:0,shield:0,fire:0 };
    this.enemies = []; this.bullets = []; this.shots = []; this.items = [];
    this.particles = []; this.rings = []; this.labels = [];
    this.boss = null;
  }
  start(difficulty = 1) {
    this.reset();
    this.difficulty = DIFFICULTIES[difficulty - 1] || DIFFICULTIES[0];
    this.beginStage(0);
    this.emit('launch');
  }
  beginStage(index) {
    this.stage = index;
    this.mode = 'playing';
    this.stageTime = this.wave = this.stageKills = this.travel = 0;
    this.enemies.length = this.bullets.length = this.shots.length = this.items.length = 0;
    this.boss = null;
    Object.assign(this.player,{x:W/2,y:H-103,lean:0,shield:1.6,fire:.28});
    this.emit('stage', index);
  }
  waveEntry(kind, x, y, path, i, dir=1) {
    const st=this.stage, r=this.random;
    this.enemies.push({
      kind, x, y, baseX:x, age:0, path, dir, phase:i*.32, t:r()*.65,
      speed:[79,90,57][kind]+st*9, hp:[2,3,8][kind]+(kind===2?st*2:0),
      rx:[11,13,18][kind], ry:[11,15,16][kind], fire:(1.2+r()*1.15+i*.15)/this.difficulty.fireRate,
      value:[100,160,360][kind], blink:0, gone:false
    });
  }
  spawnWave(n) {
    const p=(n+(this.stage?this.stage:0))%6;
    const dir=n%2===0?1:-1;
    if(p===0 || p===3) {
      const count=p===0?5:4;
      for(let i=0;i<count;i++) {
        const dx=i-(count-1)/2;
        this.waveEntry(p===3?1:0,180+dx*(p===3?58:52),-23-Math.abs(dx)*28,'glide',i,dir);
      }
    } else if(p===1 || p===4) {
      for(let i=0;i<5;i++) this.waveEntry(p===4?1:0,dir===1?35+i*5:325-i*5,-22-i*32,'sweep',i,dir);
    } else if(p===2) {
      this.waveEntry(2,98,-36,'patrol',0,1);
      this.waveEntry(2,262,-61,'patrol',1,-1);
      for(let i=0;i<3;i++) this.waveEntry(0,125+i*55,-90-i*15,'glide',i,dir);
    } else {
      for(let i=0;i<6;i++) {
        const side=i%2===0?1:-1;
        this.waveEntry(i>3?1:0,side===1?72:288,-27-Math.floor(i/2)*55,'weave',Math.floor(i/2),side);
      }
    }
  }
  spawnBoss() {
    this.enemies.length=0; this.bullets.length=0;
    const hp=Math.round([94,128,160][this.stage]*this.difficulty.bossHealth);
    this.boss={x:W/2,y:-58,hp,max:hp,age:0,fire:2.45,pattern:0,blink:0,rx:52,ry:29};
    this.emit('boss',this.stage);
  }
  addBullet(x,y,angle,speed,kind=0) {
    if(this.bullets.length>=240) return;
    speed *= this.difficulty.shotSpeed;
    this.bullets.push({x,y,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed,kind,r:kind===2?4:3,age:0,gone:false});
  }
  aim(x,y) { return Math.atan2(this.player.y-y,this.player.x-x); }
  enemyFire(e) {
    if(e.y<12 || e.y>this.player.y-45 || e.y>H-92) return;
    const a=this.aim(e.x,e.y), speed=113+this.stage*15;
    if(e.kind===2) {
      for(let i=-1;i<=1;i++) this.addBullet(e.x,e.y+11,a+i*.25,speed,1);
    } else {
      this.addBullet(e.x,e.y+8,a,speed+(e.kind===1?15:0),e.kind);
      if(this.stage===2 && e.kind===1) this.addBullet(e.x,e.y+7,a+.20,speed,1);
    }
  }
  bossFire(b) {
    const st=this.stage, phase=b.pattern++, vel=122+st*11;
    if(phase%4===3) {
      const count=[13,16,19][st], offset=b.age*.19;
      for(let i=0;i<count;i++) this.addBullet(b.x,b.y+10,offset+i*TAU/count,vel*.92,1);
      return;
    }
    if(phase%4===1) {
      for(const x of [b.x-37,b.x+37]) {
        const a=this.aim(x,b.y+12);
        for(let i=-1;i<=1;i++) this.addBullet(x,b.y+15,a+i*(.20+st*.025),vel+20,0);
      }
      return;
    }
    const count=5+st*2, swing=Math.sin(phase)*.23;
    for(let i=0;i<count;i++) this.addBullet(b.x,b.y+20,Math.PI/2+swing+(i-(count-1)/2)*.21,vel,phase%4===2?1:0);
    if(st===2) this.addBullet(b.x,b.y+20,this.aim(b.x,b.y),vel+48,2);
  }
  movePlayer(dt,input) {
    const p=this.player,old=p.x,speed=242;
    if(input.target) {
      const dx=input.target.x-p.x,dy=input.target.y-p.y,dist=Math.hypot(dx,dy);
      if(dist>.01) { const f=Math.min(1,dt*770/dist);p.x+=dx*f;p.y+=dy*f; }
    } else {
      const dx=input.x||0,dy=input.y||0,div=Math.max(1,Math.hypot(dx,dy));
      p.x+=dx/div*speed*dt;p.y+=dy/div*speed*dt;
    }
    p.x=clamp(p.x,16,W-16);p.y=clamp(p.y,35,H-23);
    p.lean+=(clamp((p.x-old)/(dt*speed),-1,1)-p.lean)*Math.min(1,dt*9);
    p.shield=Math.max(0,p.shield-dt);
    p.fire-=dt;
    if(p.fire<=0 && this.mode==='playing') {
      p.fire=this.level===3?.128:.148;
      this.playerShot(p.x-7,p.y-14,0,-478);
      this.playerShot(p.x+7,p.y-14,0,-478);
      if(this.level>1) {
        this.playerShot(p.x-12,p.y-8,-74,-453);
        this.playerShot(p.x+12,p.y-8,74,-453);
      }
      if(this.level===3) this.playerShot(p.x,p.y-23,0,-510,1);
      this.emit('shot');
    }
  }
  playerShot(x,y,dx,dy,kind=0) {this.shots.push({x,y,dx,dy,kind,gone:false});}
  burst(x,y,size=1,colors=fiery) {
    const r=this.random, count=Math.round(12*size);
    for(let i=0;i<count;i++) {
      const angle=r()*TAU,speed=(18+r()*82)*Math.min(2,size),life=.18+r()*.40;
      this.particles.push({x,y,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed,life,max:life,
        size:1+Math.floor(r()*3*size),col:colors[Math.floor(r()*colors.length)]});
    }
    this.rings.push({x,y,age:0,time:.28+.04*size,radius:9+size*11,color:colors[1]});
  }
  label(x,y,text,col) {this.labels.push({x,y,text,col,life:.65});}
  kill(e) {
    if(e.gone)return;
    e.gone=true;this.kills++;this.stageKills++;this.score+=e.value;
    this.burst(e.x,e.y,e.kind===2?1.45:.85);
    this.emit(e.kind===2?'heavyHit':'pop');
    if(e.kind===2) this.label(e.x,e.y-9,'+'+e.value,'#ffd09d');
    if(this.stageKills%5===0 || (e.kind===2 && this.stageKills%3===0)) {
      const type=this.dropCount++%3===1?'B':'P';
      this.items.push({x:e.x,y:e.y,base:clamp(e.x,22,W-22),t:0,type,gone:false});
    }
  }
  collect(item) {
    item.gone=true;
    if(item.type==='P'){this.level=Math.min(3,this.level+1);this.score+=220;}
    else {this.bombs=Math.min(3,this.bombs+1);this.score+=180;}
    this.label(this.player.x,this.player.y-28,item.type==='P'?'POWER UP':'BOMB +',item.type==='P'?'#93fff2':'#ffcf8c');
    this.burst(item.x,item.y,.5,icy);this.emit('pickup',item.type);
  }
  hurt() {
    const p=this.player;
    if(p.shield>0 || this.mode!=='playing')return;
    this.burst(p.x,p.y,2.2); this.shake=.34;this.lives--;
    this.emit('hit');this.bullets.length=0;
    if(this.lives===0){this.mode='over';this.emit('over');return;}
    this.level=Math.max(1,this.level-1);this.bombs=Math.max(2,this.bombs);
    Object.assign(p,{x:W/2,y:H-100,shield:2.8,lean:0});
    this.emit('respawn');
  }
  damageBoss(amount) {
    const b=this.boss;
    if(!b || b.y<43 || this.mode!=='playing')return;
    b.hp=Math.max(0,b.hp-amount);b.blink=.075;
    if(b.hp===0) {
      this.kills++;this.score+=2600+this.stage*1400;
      this.burst(b.x,b.y,3.2);this.burst(b.x-32,b.y+10,1.8);this.burst(b.x+32,b.y,1.9);
      this.shake=.48;this.pulse=.45;this.boss=null;
      this.bullets.length=this.enemies.length=this.shots.length=0;
      this.mode='clearing';this.clearTime=2.8;
      this.emit('clear',this.stage);
    }
  }
  bomb() {
    if(this.mode!=='playing'||!this.bombs)return false;
    this.bombs--;this.pulse=.76;this.shake=.27;
    this.rings.push({x:this.player.x,y:this.player.y,age:0,time:.75,radius:780,color:'#b9efff'});
    for(const b of this.bullets) if(this.random()<.28)this.burst(b.x,b.y,.22,icy);
    this.bullets.length=0;
    for(const e of this.enemies)if(!e.gone && e.y>-10 && e.y<H+14)this.kill(e);
    this.player.shield=Math.max(this.player.shield,1.0);
    this.emit('bomb');this.damageBoss(20);return true;
  }
  updateEffects(dt) {
    this.shake=Math.max(0,this.shake-dt);this.pulse=Math.max(0,this.pulse-dt);
    for(const p of this.particles){p.life-=dt;p.x+=p.dx*dt;p.y+=p.dy*dt;p.dx*=.968;p.dy*=.969;p.dy+=dt*26;}
    for(const r of this.rings)r.age+=dt;
    for(const t of this.labels){t.y-=dt*19;t.life-=dt;}
    this.particles=this.particles.filter(p=>p.life>0).slice(-360);
    this.rings=this.rings.filter(r=>r.age<r.time).slice(-65);this.labels=this.labels.filter(t=>t.life>0);
  }
  advanceEnemies(dt) {
    for(const e of this.enemies) {
      if(e.gone)continue;
      e.age+=dt;e.y+=e.speed*dt;e.blink=Math.max(0,e.blink-dt);
      if(e.path==='sweep'){e.x=e.baseX+e.dir*(1-Math.cos(e.age*.85))*115;}
      else if(e.path==='patrol'){e.x=e.baseX+e.dir*Math.sin(e.age*.94)*36;}
      else if(e.path==='weave'){e.x=e.baseX+e.dir*(1-Math.cos(e.age*1.55)) * 43;}
      else {e.x=e.baseX+Math.sin(e.age*1.45+e.phase)*17;}
      e.fire-=dt;
      if(e.fire<=0){this.enemyFire(e);e.fire=((e.kind===2?1.85:2.55)-this.stage*.24+this.random()*.38)/this.difficulty.fireRate;}
    }
    const b=this.boss;
    if(b) {
      b.age+=dt;b.blink=Math.max(0,b.blink-dt);
      if(b.age<2.1){b.y=-58+167*(1-(1-b.age/2.1)**2);}
      else {
        const t=b.age-2.1;b.x=W/2+Math.sin(t*(.64+.08*this.stage))*(87+this.stage*5);
        b.y=109+Math.sin(t*.88)*14+Math.sin(t*.39)*9;
      }
      b.fire-=dt;
      if(b.fire<=0){this.bossFire(b);b.fire=(1.22-this.stage*.145+(b.pattern%4===0?.42:0))/this.difficulty.fireRate;}
    }
  }
  resolveShots(dt) {
    for(const s of this.shots) {
      if(s.gone)continue;
      s.x+=s.dx*dt;s.y+=s.dy*dt;
      for(const e of this.enemies) {
        if(e.gone||!rangeHit(s,e,e.rx+3,e.ry+4))continue;
        e.hp-=s.kind?2:1;e.blink=.075;s.gone=true;
        if(e.hp<=0)this.kill(e);
        break;
      }
      const b=this.boss;
      if(!s.gone && b && b.y>43 && rangeHit(s,b,b.rx,b.ry+4)){s.gone=true;this.damageBoss(s.kind?2:1);}
    }
    this.shots=this.shots.filter(s=>!s.gone&&s.y>-20&&s.x>-10&&s.x<W+10);
  }
  resolveHazards(dt) {
    const p=this.player;
    for(const b of this.bullets) {
      b.age+=dt;b.x+=b.dx*dt;b.y+=b.dy*dt;
      if(p.shield<=0&&rangeHit(b,p,b.r+4,b.r+4)){b.gone=true;this.hurt();break;}
    }
    this.bullets=this.bullets.filter(b=>!b.gone&&b.x>-15&&b.x<W+15&&b.y>-20&&b.y<H+18);
    if(p.shield<=0) {
      for(const e of this.enemies)if(!e.gone&&rangeHit(e,p,e.rx+4,e.ry+3)){this.hurt();break;}
      if(this.boss && rangeHit(this.boss,p,51,33))this.hurt();
    }
    this.enemies=this.enemies.filter(e=>!e.gone&&e.y<H+42);
    for(const item of this.items) {
      item.t+=dt;item.y+=65*dt;item.x=item.base+Math.sin(item.t*2.1)*9;
      if(this.mode==='playing' && rangeHit(item,p,23,27))this.collect(item);
    }
    this.items=this.items.filter(i=>!i.gone&&i.y<H+20);
  }
  step(dt,input={}) {
    if(this.mode!=='playing'&&this.mode!=='clearing')return;
    this.time+=dt;this.stageTime+=dt;this.travel+=dt*(43+this.stage*7);
    this.updateEffects(dt);
    this.movePlayer(dt,input);
    if(this.mode==='clearing') {
      this.clearTime-=dt;
      if(this.clearTime<=0) {
        if(this.stage+1===STAGES.length){this.mode='won';this.emit('won');}
        else {this.bombs=Math.min(3,this.bombs+1);this.beginStage(this.stage+1);}
      }
      return;
    }
    const waveClock=this.stageTime*this.difficulty.waveRate;
    if(this.wave<WAVES.length && waveClock>=WAVES[this.wave])this.spawnWave(this.wave++);
    if(!this.boss && this.wave===WAVES.length && waveClock>=38+this.stage)this.spawnBoss();
    this.advanceEnemies(dt);
    this.resolveShots(dt);
    if(this.mode==='playing')this.resolveHazards(dt);
  }
}
