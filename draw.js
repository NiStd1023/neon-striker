import { W,H,STAGES } from './engine.js';
const round=Math.round;
const sprites=['vx01','kite','wisp','brute','boss1','boss2','boss3'];
const enemyArt=['kite','wisp','brute'];
const enemySize=[[27,27],[35,34],[46,40]];
const TAU=Math.PI*2;
function cachedColor(image,color) {
  const tmp=document.createElement('canvas');tmp.width=image.naturalWidth;tmp.height=image.naturalHeight;
  const d=tmp.getContext('2d');d.drawImage(image,0,0);d.globalCompositeOperation='source-in';d.fillStyle=color;d.fillRect(0,0,tmp.width,tmp.height);return tmp;
}
export class Renderer {
  constructor(canvas) {
    this.c=canvas.getContext('2d',{alpha:false});
    this.c.imageSmoothingEnabled=false;
    this.art={};this.shadow={};this.bright={};
    this.lowMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    for(const name of [...sprites,'stage1','stage2','stage3']) {
      const isSprite=sprites.includes(name),im=new Image();im.decoding='async';
      im.onload=()=>{
        this.art[name]=im;
        if(isSprite){this.shadow[name]=cachedColor(im,'#0a0816');this.bright[name]=cachedColor(im,'#fff8d5');}
      };
      im.src='assets/'+name+(isSprite?'.png':'.webp');
    }
  }
  background(g) {
    const c=this.c,im=this.art['stage'+(g.stage+1)];
    c.fillStyle=['#20162d','#102a29','#271d30'][g.stage];c.fillRect(-8,-8,W+16,H+16);
    if(im){
      const h=im.naturalHeight,pos=Math.floor(g.travel)%h;
      for(let y=pos-h;y<H+5;y+=h)c.drawImage(im,-3,y,W+6,h+1);
    }
    c.fillStyle=['#15102428','#0b1c202b','#20132330'][g.stage];c.fillRect(0,0,W,H);
    for(let i=0;i<20;i++){
      const x=(17+i*83+(i%4)*21)%W;
      const y=Math.floor((i*113+g.travel*(i%3*.5+1.1))%(H+15));
      c.fillStyle=i%4===0?'#c7adde60':'#a998c132';c.fillRect(x,y,i%6===0?2:1,i%5===0?5:2);
    }
  }
  ship(key,x,y,w,h,blink=0,tilt=0) {
    const c=this.c,img=this.art[key];if(!img)return;
    const px=round(x),py=round(y);
    c.save();c.translate(px,py);if(tilt)c.rotate(tilt);
    const l=-round(w/2),t=-round(h/2);
    c.globalAlpha=.4;c.drawImage(this.shadow[key],l+3,t+6,w,h);c.globalAlpha=1;
    c.drawImage(img,l,t,w,h);
    if(blink>0){c.globalAlpha=Math.min(.72,blink*9);c.drawImage(this.bright[key],l,t,w,h);c.globalAlpha=1;}
    c.restore();
  }
  player(g) {
    if(!g.lives)return;
    const c=this.c,p=g.player,x=round(p.x),y=round(p.y),a=Math.sin(g.time*42),lean=p.lean;
    c.save();
    if(p.shield>.05) {
      c.strokeStyle='#98ccef99';c.lineWidth=1;c.setLineDash([5,4]);c.lineDashOffset=-g.time*22;
      c.beginPath();c.ellipse(x,y+1,22,26,0,0,TAU);c.stroke();c.setLineDash([]);
    }
    for(const side of [-1,1]) {
      const xx=x+side*4,yy=y+14;
      c.fillStyle='#605ce2';c.fillRect(xx-2,yy,5,round(10+a*2));
      c.fillStyle='#3dbdf4';c.fillRect(xx-1,yy,3,round(12-a*3));
      c.fillStyle='#d5ffff';c.fillRect(xx,yy,2,round(7+a));
    }
    this.ship('vx01',x,y,39-Math.abs(lean)*2,44,p.shield>0&&!this.lowMotion?.035:0,lean*.075);
    c.fillStyle='#f2ffff';c.fillRect(x-1,y-1,3,3);c.fillStyle='#70e5f7';c.fillRect(x,y-2,1,1);
    c.restore();
  }
  playerBeam(s) {
    const c=this.c,x=round(s.x),y=round(s.y);c.save();c.translate(x,y);
    if(s.dx)c.rotate(Math.atan(s.dx/470));
    c.fillStyle=s.kind?'#f4a6e052':'#49bfe74b';c.fillRect(-3,-8,7,16);
    c.fillStyle=s.kind?'#f892d6':'#4bbbed';c.fillRect(-2,-7,5,14);
    c.fillStyle=s.kind?'#ffe8fa':'#c7fcff';c.fillRect(-1,-8,3,12);c.fillRect(0,-10,1,2);
    c.restore();
  }
  enemyBullet(b) {
    const c=this.c,x=round(b.x),y=round(b.y),s=b.kind===2?1.28:1;
    const tone=b.kind===1?'#ec69aa':'#ff9c55',core=b.kind===1?'#ffe0f5':'#fff1ac';
    c.save();c.translate(x,y);if(s!==1)c.scale(s,s);
    c.fillStyle='#170e24';c.fillRect(-3,-5,6,10);c.fillRect(-5,-3,10,6);
    c.fillStyle=tone;c.fillRect(-2,-4,4,8);c.fillRect(-4,-2,8,4);c.fillRect(-3,-3,6,6);
    c.fillStyle=core;c.fillRect(-2,-2,4,4);c.fillRect(-1,-3,2,6);
    c.fillStyle='#fffbed';c.fillRect(-1,-1,2,2);c.restore();
  }
  item(it,g) {
    const c=this.c,x=round(it.x),y=round(it.y),col=it.type==='P'?'#8aeeda':'#ffcf88';
    c.save();c.translate(x,y);c.fillStyle='#1c1930';c.fillRect(-9,-8,18,16);c.fillRect(-7,-10,14,20);
    c.fillStyle=col;c.fillRect(-7,-9,14,1);c.fillRect(-7,8,14,1);c.fillRect(-9,-7,1,14);c.fillRect(8,-7,1,14);
    c.fillStyle=it.type==='P'?'#204e51':'#564229';c.fillRect(-7,-7,14,14);
    c.fillStyle=col;c.textAlign='center';c.textBaseline='middle';c.font='12px PulseGrid,monospace';c.fillText(it.type,1,1);
    if(Math.sin(g.time*6)>.45){c.fillRect(8,-11,1,3);c.fillRect(7,-10,3,1);}c.restore();
  }
  effects(g) {
    const c=this.c;
    for(const p of g.particles) {
      const f=Math.min(1,p.life/p.max*1.7);c.globalAlpha=f;c.fillStyle=p.col;
      const sz=Math.max(1,round(p.size*f));c.fillRect(round(p.x)-sz/2|0,round(p.y)-sz/2|0,sz,sz);
    }
    c.globalAlpha=1;
    for(const r of g.rings) {
      const t=r.age/r.time;
      c.strokeStyle=r.color;c.lineWidth=r.radius>100?Math.max(1,9*(1-t)):Math.max(1,3*(1-t));
      c.globalAlpha=Math.min(.8,(1-t)*1.25);c.beginPath();c.arc(round(r.x),round(r.y),Math.max(1,r.radius*t),0,TAU);c.stroke();
    }
    c.globalAlpha=1;
    for(const l of g.labels){
      c.globalAlpha=Math.min(1,l.life*3);c.font='10px PulseGrid,monospace';c.textAlign='center';c.fillStyle='#1e1122';c.fillText(l.text,round(l.x)+1,round(l.y)+1);
      c.fillStyle=l.col;c.fillText(l.text,round(l.x),round(l.y));c.globalAlpha=1;
    }
  }
  ribbon(heading,title,col,alpha=1) {
    const c=this.c;c.save();c.globalAlpha=alpha;
    const x=W/2,y=H*.34;
    c.fillStyle='#100c22da';c.fillRect(x-106,y-26,212,57);
    c.fillStyle=col;c.fillRect(x-106,y-26,25,2);c.fillRect(x+81,y+29,25,2);
    c.font='12px PulseGrid,monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(heading,x,y-10);
    c.fillStyle='#fcf2fa';c.font='700 22px system-ui,CabinTC,sans-serif';c.fillText(title,x,y+12);
    c.restore();
  }
  draw(g) {
    const c=this.c;
    c.save();
    if(g.shake>0&&!this.lowMotion){const k=g.shake*6;c.translate(round(Math.sin(g.time*123)*k),round(Math.cos(g.time*103)*k));}
    this.background(g);
    for(const s of g.shots)this.playerBeam(s);
    for(const e of g.enemies){
      if(e.gone)continue;
      const [w,h]=enemySize[e.kind];this.ship(enemyArt[e.kind],e.x,e.y,w,h,e.blink);
    }
    if(g.boss) {
      const b=g.boss;this.ship('boss'+(g.stage+1),b.x,b.y,129,86,b.blink);
      if(b.fire<.28&&b.y>50){
        c.fillStyle='#ffe7b7';c.fillRect(round(b.x)-2,round(b.y)+17,5,5);
        c.fillStyle='#e379a4';c.fillRect(round(b.x)-3,round(b.y)+19,7,1);
      }
    }
    for(const i of g.items)this.item(i,g);
    this.player(g);
    for(const b of g.bullets)this.enemyBullet(b);
    this.effects(g);
    c.restore();
    if(g.pulse>0){c.fillStyle='rgba(141,207,249,'+(g.pulse*(this.lowMotion?.14:.28))+')';c.fillRect(0,0,W,H);}
    if(g.mode==='clearing')this.ribbon('SECTOR CLEAR','空域突破',STAGES[g.stage].tint,Math.min(1,(2.8-g.clearTime)*3,g.clearTime*2));
    else if(g.stageTime<2.6 && g.mode==='playing')this.ribbon('STAGE 0'+(g.stage+1),STAGES[g.stage].name,STAGES[g.stage].tint,Math.min(1,g.stageTime*4,(2.6-g.stageTime)*2.5));
    else if(g.boss&&g.boss.age<1.8)this.ribbon('WARNING',STAGES[g.stage].boss,'#ffb091',Math.min(1,g.boss.age*4,(1.8-g.boss.age)*3));
  }
}
