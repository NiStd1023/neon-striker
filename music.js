import { CUES, LOOP_GUARD } from './assets/music/cues.js';

const mixLevel = 0.76;
const durationOf = cue => 240 * cue.bars / cue.bpm;

// The score is pre-rendered. The audio clock only runs one looping stereo
// source (two briefly during a transition), even on a busy bullet screen.
export class BattleMusic {
  constructor(prefetch = true) {
    this.encoded = new Map();
    this.decoded = new Map();
    this.ticket = null;
    this.voice = null;
    this.cursor = { cue: null, offset: 0 };
    if (prefetch) this.bytes(CUES[0][0]).catch(() => {});
  }

  attach(context, master) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.gain.value = mixLevel;
    this.bus.connect(master);
  }

  bytes(cue) {
    if (!this.encoded.has(cue)) {
      const url = new URL('./assets/music/' + cue.file, import.meta.url);
      const request = fetch(url).then(response => {
        if (!response.ok) throw new Error('Music request failed: ' + response.status);
        return response.arrayBuffer();
      }).catch(error => {
        this.encoded.delete(cue);
        throw error;
      });
      this.encoded.set(cue, request);
    }
    return this.encoded.get(cue);
  }

  buffer(cue) {
    if (!this.decoded.has(cue)) {
      const decoded = this.bytes(cue)
        .then(bytes => this.context.decodeAudioData(bytes.slice(0)))
        .catch(error => {
          if (this.decoded.get(cue) === decoded) this.decoded.delete(cue);
          this.encoded.delete(cue);
          throw error;
        });
      this.decoded.set(cue, decoded);
    }
    return this.decoded.get(cue);
  }

  fadeOut(time, seconds) {
    const old = this.voice;
    if (!old) return;
    this.voice = null;
    const gain = old.gain.gain;
    // The current level can still be on its attack when pause or mute is tapped.
    const fraction = Math.max(0, Math.min(1, (time - old.when) / old.fadeIn));
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(fraction, time);
    gain.linearRampToValueAtTime(0, time + seconds);
    old.source.stop(time + seconds + 0.006);
  }

  play(stage, boss) {
    if (!this.context || !CUES[stage]) return;
    const cue = CUES[stage][Number(Boolean(boss))];
    if (this.ticket?.cue === cue) return this.ticket.ready;
    const next = boss ? CUES[stage + 1]?.[0] : CUES[stage][1];
    if (this.cursor.cue !== cue) this.cursor = { cue, offset: 0 };
    const ticket = { cue, ready: null };
    this.ticket = ticket;
    // Retain compressed clips, but only keep the current and upcoming PCM buffers.
    for (const cached of this.decoded.keys()) {
      if (cached !== cue && cached !== next) this.decoded.delete(cached);
    }
    ticket.ready = this.begin(ticket, next);
    return ticket.ready;
  }

  async begin(ticket, upcoming) {
    const cue = ticket.cue;
    let buffer;
    for (const delay of [0, 400, 1100]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (this.ticket !== ticket) return;
      try {
        buffer = await this.buffer(cue);
        break;
      } catch {
        // A dropped mobile request is safe to retry; a pause invalidates the ticket.
      }
    }
    if (this.ticket !== ticket) return;
    if (!buffer) {
      this.fadeOut(this.context.currentTime, .09);
      this.ticket = null;
      return;
    }

    const ctx = this.context;
    const now = ctx.currentTime;
    const transition = Boolean(this.voice);
    const fadeIn = transition ? .155 : .018;
    const when = now + .012;
    this.fadeOut(when, fadeIn);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const cycle = durationOf(cue);
    const offset = this.cursor.offset % cycle;
    source.buffer = buffer;
    source.loop = true;
    // The encoded files include wrapped handles at both ends. Neither encoder
    // padding nor an MP3 edge transient becomes part of the loop.
    source.loopStart = LOOP_GUARD;
    source.loopEnd = LOOP_GUARD + cycle;
    source.connect(gain);
    gain.connect(this.bus);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, when + fadeIn);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(when, LOOP_GUARD + offset);
    this.voice = { cue, source, gain, offset, when, fadeIn };
    if (upcoming) this.buffer(upcoming).catch(() => {});
  }

  stop(reset = false) {
    this.ticket = null;
    const voice = this.voice;
    if (voice) {
      const now = this.context.currentTime;
      if (voice.cue === this.cursor.cue) {
        const elapsed = Math.max(0, now - voice.when);
        this.cursor.offset = (voice.offset + elapsed) % durationOf(voice.cue);
      }
      this.fadeOut(now, .045);
    }
    if (reset) this.cursor = { cue: null, offset: 0 };
  }

  duck() {
    if (!this.bus || !this.voice) return;
    const gain = this.bus.gain;
    const now = this.context.currentTime;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else gain.cancelScheduledValues(now);
    gain.setTargetAtTime(mixLevel * .62, now, .023);
    gain.setTargetAtTime(mixLevel, now + .17, .10);
  }
}
