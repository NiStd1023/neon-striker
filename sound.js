import { BattleMusic } from './music.js';

// Cabinet effects and musical cues share one audio context and output mixer.
const hz = midi => 440 * 2**((midi-69)/12);
export class ArcadeAudio {
  constructor(enabled=true) {
    this.enabled = enabled;
    this.ctx = null;
    this.stage = 0;
    this.score = new BattleMusic(enabled);
    this.lastSound = {};
  }
  unlock() {
    try {
      if(!this.ctx) {
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)return;
        this.ctx=new Audio();
        const c=this.ctx, comp=c.createDynamicsCompressor();
        comp.threshold.value=-15;comp.knee.value=13;comp.ratio.value=5;
        this.master=c.createGain();this.master.gain.value=this.enabled?.68:0;
        this.master.connect(comp);comp.connect(c.destination);
        this.score.attach(c, this.master);
        this.fx=c.createGain();this.fx.gain.value=.86;this.fx.connect(this.master);
        this.noiseBuf=c.createBuffer(1,Math.ceil(c.sampleRate*.8),c.sampleRate);
        const a=this.noiseBuf.getChannelData(0);let seed=29683;
        for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=(seed/2147483648)-1;}
      }
      if(this.ctx.state==='suspended'||this.ctx.state==='interrupted')this.ctx.resume().catch(()=>{});
    } catch { /* The game remains playable on devices with audio disabled. */ }
  }
  setEnabled(on) {
    this.enabled=on;
    if(this.ctx)this.master.gain.setTargetAtTime(on?.68:0,this.ctx.currentTime,.014);
    if(!on)this.stopMusic();
  }
  tone(freq,at,dur,shape,level,bus,slide=null,attack=.006) {
    const c=this.ctx,osc=c.createOscillator(),env=c.createGain();
    osc.type=shape;
    osc.frequency.setValueAtTime(Math.max(18,freq),at);
    if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(18,slide),at+dur);
    env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(Math.max(level,.0002),at+Math.min(dur*.3,attack));
    env.gain.exponentialRampToValueAtTime(.0001,at+dur);
    osc.connect(env);env.connect(bus);osc.start(at);osc.stop(at+dur+.015);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  noise(at,dur,level,filter,freq,bus) {
    const c=this.ctx,src=c.createBufferSource(),f=c.createBiquadFilter(),env=c.createGain();
    src.buffer=this.noiseBuf;f.type=filter;f.frequency.value=freq;f.Q.value=.75;
    env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(level,at+.004);env.gain.exponentialRampToValueAtTime(.0001,at+dur);
    src.connect(f);f.connect(env);env.connect(bus);src.start(at,Math.random()*.2);src.stop(at+dur+.012);
    src.onended=()=>{src.disconnect();f.disconnect();env.disconnect();};
  }
  music(stage = 0, boss = false) {
    this.stage = stage;
    if (this.enabled && this.ctx) return this.score.play(stage, boss);
  }
  stopMusic() {
    this.score.stop();
  }
  resetMusic() {
    this.score.stop(true);
  }
  effect(name) {
    if(!this.ctx||!this.enabled||this.ctx.state==='closed')return;
    const c=this.ctx,t=c.currentTime,b=this.fx;
    const gap={shot:.13,pop:.055,heavyHit:.07,hit:.18}[name]||0;
    if(t-(this.lastSound[name]??-10)<gap)return;
    this.lastSound[name]=t;
    if (name==='bomb' || name==='hit' || name==='boss') this.score.duck();
    const tone=(f,delay,dur,type,level,end)=>this.tone(f,t+delay,dur,type,level,b,end);
    const hiss=(delay,dur,level,type,hz)=>this.noise(t+delay,dur,level,type,hz,b);
    const notes=(array,step,duration,level)=>array.forEach((n,i)=>tone(hz(n),i*step,duration,'square',level));
    const tonic = [64, 57, 62][this.stage];
    const motif = (steps, pace, hold, level) => notes(steps.map(n => tonic+n), pace, hold, level);
    switch(name) {
      case 'shot':tone(1130,0,.066,'triangle',.088,360);tone(690,.009,.047,'square',.019,290);break;
      case 'pop':hiss(0,.14,.15,'bandpass',1380);tone(120,0,.12,'triangle',.16,52);break;
      case 'heavyHit':hiss(0,.24,.22,'lowpass',2100);tone(128,0,.24,'sawtooth',.13,31);break;
      case 'bomb':tone(410,0,.28,'sawtooth',.12,44);hiss(.035,.53,.33,'lowpass',2500);tone(104,.02,.58,'sine',.34,27);break;
      case 'pickup':notes([76,83,88,95],.045,.11,.11);break;
      case 'hit':hiss(0,.40,.31,'lowpass',2150);tone(224,0,.38,'sawtooth',.145,36);break;
      case 'launch':motif([0,7,12],.055,.09,.055);break;
      case 'boss':motif([-12,-12,-5],.105,.09,.090);break;
      case 'clear':motif([0,3,7,10,12,15],.09,.21,.090);hiss(0,.44,.22,'lowpass',1700);break;
      case 'won':motif([0,4,7,12,16,19,24],.10,.28,.095);break;
      case 'over':notes([67,63,60,55],.16,.30,.084);break;
      case 'ui':tone(hz(78),0,.07,'square',.08);break;
    }
  }
}
