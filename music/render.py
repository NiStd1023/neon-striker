"""Render the original battle score to the six gapless stereo loops used by the game.

Run with Python 3, NumPy, SciPy, libfluidsynth, TimGM6mb.sf2 and FFmpeg.
    python3 -B music/render.py --out dist/assets/music
The General MIDI bank supplies dry instrument attacks and drum hits.
All notes, articulations, FM patches, mix automation and room effects are
defined here or in score.py. The synthesizer and SoundFont are build tools.
"""
import argparse
import ctypes as ct
import ctypes.util
import json
import math
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

from score import CUES

RATE = 44100
GUARD = 0.12
TAU = 2 * math.pi
DEFAULT_BANK = '/usr/share/sounds/sf2/TimGM6mb.sf2'
ROOT = Path(__file__).resolve().parent.parent


def seconds(n):
    return round(n * RATE)


def time_axis(duration):
    return np.arange(max(1, seconds(duration)), dtype=np.float64) / RATE


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def normalized(x):
    return x / max(0.00001, np.max(np.abs(x)))


def filtering(x, kind, cutoff, order=2):
    sos = signal.butter(order, cutoff, btype=kind, fs=RATE, output='sos')
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


class Bank:
    """Render dry one-shots with the native synth, outside the browser."""
    def __init__(self, bank_path):
        lib = self.lib = ct.CDLL(ctypes.util.find_library('fluidsynth'))
        ptr, integer, floating, string = ct.c_void_p, ct.c_int, ct.c_double, ct.c_char_p
        for name, result, args in [
            ('new_fluid_settings', ptr, []), ('delete_fluid_settings', None, [ptr]),
            ('fluid_settings_setnum', integer, [ptr, string, floating]),
            ('fluid_settings_setint', integer, [ptr, string, integer]),
            ('new_fluid_synth', ptr, [ptr]), ('delete_fluid_synth', None, [ptr]),
            ('fluid_synth_sfload', integer, [ptr, string, integer]),
            ('fluid_synth_program_select', integer, [ptr, integer, integer, integer, integer]),
            ('fluid_synth_noteon', integer, [ptr, integer, integer, integer]),
            ('fluid_synth_all_sounds_off', integer, [ptr, integer]),
            ('fluid_synth_write_float', integer, [ptr, integer, ptr, integer, integer, ptr, integer, integer]),
        ]:
            fn = getattr(lib, name)
            fn.restype, fn.argtypes = result, args
        self.settings = lib.new_fluid_settings()
        lib.fluid_settings_setnum(self.settings, b'synth.sample-rate', RATE)
        lib.fluid_settings_setnum(self.settings, b'synth.gain', .62)
        for setting in (b'synth.reverb.active', b'synth.chorus.active'):
            lib.fluid_settings_setint(self.settings, setting, 0)
        self.synth = lib.new_fluid_synth(self.settings)
        self.id = lib.fluid_synth_sfload(self.synth, str(bank_path).encode(), 1)
        if self.id < 0:
            raise ValueError(f'Could not open {bank_path}')

    @lru_cache(maxsize=300)
    def shot(self, program, note, drum=False):
        channel, bank = (9, 128) if drum else (0, 0)
        lib = self.lib
        lib.fluid_synth_all_sounds_off(self.synth, channel)
        if lib.fluid_synth_program_select(self.synth, channel, self.id, bank, program) < 0:
            raise ValueError(f'Missing preset {bank}:{program}')
        lib.fluid_synth_noteon(self.synth, channel, note, 108 if drum else 100)
        n = seconds(2 if drum else 1.9)
        x, y = np.zeros(n, np.float32), np.zeros(n, np.float32)
        lib.fluid_synth_write_float(self.synth, n, x.ctypes.data, 0, 1, y.ctypes.data, 0, 1)
        lib.fluid_synth_all_sounds_off(self.synth, channel)
        mono = .5 * (x + y)
        # The native synth renders in blocks; align each stroke to the score.
        attack = np.flatnonzero(np.abs(mono) > max(.000002, np.max(np.abs(mono)) * .0015))
        if not len(attack):
            raise ValueError(f'Silent preset {program}, note {note}')
        mono = mono[max(attack[0] - 7, 0):]
        mono = np.pad(mono, (0, n - len(mono)))
        return normalized(mono).astype(np.float32)

    def close(self):
        self.shot.cache_clear()
        self.lib.delete_fluid_synth(self.synth)
        self.lib.delete_fluid_settings(self.settings)


def adsr(t, gate, attack, decay, sustain, release):
    env = np.minimum(1, t / attack) * (sustain + (1-sustain) * np.exp(-np.maximum(0, t-attack) / decay))
    return env * np.exp(-np.maximum(0, t-gate) * (5.7 / release))


def take(sample, t, ratio=1):
    position = t * (RATE * ratio)
    return np.interp(position, np.arange(len(sample)), sample, left=0, right=0)


def fm_lead(note, gate, style, accent, guitar, sample_bank):
    """Two detuned operators, an expressive pitch attack and delayed vibrato."""
    t = time_axis(gate + .11)
    f = hz(note)
    vibrato = np.minimum(1, np.maximum(0, (t-.135)/.17)) * np.sin(TAU * 5.6 * t)
    cents = 15 * vibrato - (23 if accent else 12) * np.exp(-t/.018)
    phase = TAU * np.cumsum(f * 2**(cents/1200)) / RATE
    contour = np.exp(-t/.12)
    index = [.83, .60, 1.04][style] + (.62 if accent else .46) * contour
    carrier = np.sin(phase + index * np.sin(phase))
    reed = np.sin(phase*1.0018 + .49 * np.sin(phase*2.0036 + .12))
    edge = .13 * np.sin(2*phase + .35*np.sin(4*phase)) + .075 * np.sin(3*phase + .23)
    wave = .68*carrier + .30*reed + edge
    if guitar:
        dry = take(sample_bank.shot(29, note), t, .9988)
        wave = .78*wave + .30*filtering(dry, 'bandpass', (340, 4100))
    env = adsr(t, gate, .007 if accent else .012, .15, .79, .11)
    return filtering(wave*env, 'lowpass', 5400).astype(np.float32)


def brass(note, gate, soft=False):
    t = time_axis(gate + .12)
    f = hz(note)
    # The brighter partials swell into a held note; the attack has a little lip.
    phase = TAU * f * (t + .00029*np.exp(-t/.023) + .00020*np.sin(TAU*4.5*t)*np.minimum(t,.3))
    bright = 1-np.exp(-t/(.058 if soft else .023))
    harmonics = np.sin(phase)+.47*bright*np.sin(phase*2+.18)+.31*bright*np.sin(3*phase+.3)
    harmonics += .17*bright*np.sin(phase*4.004+.37)+.10*bright*np.sin(phase*5.003+.14)
    env = adsr(t, gate, .033 if soft else .017, .13, .72, .12)
    return (harmonics * env * .75).astype(np.float32)


def bass_voice(note, gate, high, bank):
    t = time_axis(gate+.041)
    f = hz(note); phase = TAU*f*t
    bite = np.exp(-t/.082)
    sample = take(bank.shot(34, note), t)
    body = np.sin(phase + (.27+.85*bite)*np.sin(phase*2)) + .18*np.sin(phase*2)
    wave = .52 * sample + .63 * body + .08 * np.sin(phase*3) * bite
    return (np.tanh(wave*1.33) * adsr(t, gate, .0035, .10, .74 if high else .83, .041)).astype(np.float32)


def chord_guitar(root, gate, ringing, bank):
    """Two different pick attacks and string offsets make a stereo double-track."""
    release = .13 if ringing else .046
    t = time_axis(gate + release)
    rhythm = []
    for take_no in range(2):
        wave = np.zeros(len(t))
        for j, interval in enumerate((0, 7, 12)):
            ts = np.maximum(0, t - (.003+.0013*take_no)*j - take_no*.004)
            pitch = root + interval
            detune = 1 + [-.0019, .0023][take_no] + .00027*j
            dry = take(bank.shot(28, pitch), ts, detune)
            held = take(bank.shot(29, pitch), ts, detune)
            string = .27*dry+.74*held if ringing else .82*dry+.28*held
            wave += string * (1, .68, .27)[j]
        # Keep the amp harmonics out of the bass and lead's upper register.
        wave = filtering(wave, 'highpass', 105)
        wave = np.tanh(wave * (2.0 if ringing else 2.55))
        wave = filtering(wave, 'lowpass', (3900 if ringing else 3250)+240*take_no, 3)
        wave = filtering(wave, 'highpass', 130)
        env = adsr(t, gate, .003, .085 if ringing else .050, .77 if ringing else .39, release)
        rhythm.append(wave*env)
    return np.stack(rhythm, axis=1).astype(np.float32)


def bell(note, gate):
    t = time_axis(gate+.095)
    phase = TAU*hz(note)*t
    wave = np.sin(phase + (1.14*np.exp(-t/.09)) * np.sin(phase*2.001))
    return (wave * adsr(t, gate, .004, .062, .37, .095)).astype(np.float32)


def make_drums(bank):
    rng = np.random.default_rng(617)
    drums = {}
    def sample(key, duration):
        return bank.shot(0, key, True)[:seconds(duration)].copy()
    kick = sample(36, .31)
    t = np.arange(len(kick))/RATE
    body = np.sin(TAU*(49*t + 3.0*(1-np.exp(-t/.031))))*np.exp(-t/.100)
    drums['kick'] = normalized(.92*kick + .62*body*np.minimum(1,t/.002))
    snare = sample(38, .32)
    t = np.arange(len(snare))/RATE
    shell = np.sin(TAU*(181*t + .78*(1-np.exp(-t/.021))))*np.exp(-t/.079)
    fizz = filtering(rng.normal(0,1,len(t)), 'bandpass',(1200,7400))*np.exp(-t/.072)
    drums['snare'] = normalized(.93*snare+.38*shell+.25*fizz)
    drums['ghost'] = normalized(.80*sample(40, .16)+.21*drums['snare'][:seconds(.16)])
    for key, note, dur in (('hat',42,.13),('open',46,.32),('ride',51,.59),('crash',49,1.13),
                           ('crash2',57,1.12),('tomHi',50,.32),('tomMid',47,.36),('tomLow',43,.42)):
        x = sample(note,dur)
        if key in ('hat','open','ride','crash','crash2'):
            x = filtering(x,'highpass',3500 if key=='hat' else 1700)
        drums[key]=normalized(x)
    for key,wave in drums.items():
        wave[-min(len(wave),seconds(.017)):] *= np.linspace(1,0,min(len(wave),seconds(.017)))
        drums[key] = wave.astype(np.float32)
    return drums


class Mix:
    def __init__(self, cue):
        self.beat = 60 / cue.bpm
        self.step = self.beat / 4
        self.n = seconds(len(cue.bars)*4*self.beat)
        self.stems = {name:np.zeros((self.n,2),np.float32) for name in
                      ('drums','bass','guitar','lead','horn','keys')}
        self.kicks = []

    def put(self, stem, onset, wave, gain, pan=0):
        start = seconds(onset) % self.n
        if wave.ndim == 1:
            angle=(pan+1)*math.pi/4
            stereo = wave[:,None] * np.array([math.cos(angle),math.sin(angle)],np.float32)
        else:
            stereo = wave
        stereo=stereo*gain
        left=min(len(stereo),self.n-start)
        self.stems[stem][start:start+left] += stereo[:left]
        if left<len(stereo):
            self.stems[stem][:len(stereo)-left] += stereo[left:]


KICKS = [
    ((0,6,8,11),(0,3,8,10,14),(0,6,8,10),(0,5,8,14)),
    ((0,3,8,13),(0,6,10,14),(0,3,8,11),(0,7,10,14)),
    ((0,2,7,8,11),(0,3,8,10,14),(0,6,8,11,14),(0,3,6,8,14)),
]
BOSS_KICKS = ((0,2,3,8,10,11),(0,3,6,9,10,14),(0,2,6,8,10,14),(0,1,5,8,10,13))
GUITARS = [
    ((0,2),(3,1),(6,2),(8,3),(12,2),(15,1)),
    ((0,3),(5,1),(6,2),(9,3),(14,2)),
    ((0,2),(2,1),(3,1),(6,2),(8,3),(12,2),(14,1),(15,1)),
]
BASS = [
    ((0,3,0),(3,2,0),(6,2,7),(8,3,0),(11,2,12),(14,2,7)),
    ((0,3,0),(3,3,12),(6,2,7),(8,3,0),(12,2,7),(14,2,12)),
    ((0,2,0),(2,1,0),(3,1,12),(4,3,7),(7,1,0),(8,3,0),(12,2,7),(14,2,12)),
]
DRUM_PAN={'hat':-.20,'open':-.23,'ride':.33,'crash':-.36,'crash2':.43,'tomHi':-.37,'tomMid':.08,'tomLow':.36}
DRUM_GAIN={'kick':.85,'snare':.77,'ghost':.34,'hat':.23,'open':.27,'ride':.32,'crash':.48,'crash2':.48,'tomHi':.55,'tomMid':.59,'tomLow':.64}


def rhythm_section(mix,cue,bar,idx,bank,drums):
    start=idx*16*mix.step
    lift=8<=idx<16
    boss=cue.boss
    fill=idx%4==3
    last=idx==len(cue.bars)-1
    def chord(step):
        return bar.chords[min(len(bar.chords)-1, int(step//(16/len(bar.chords))))]
    def drum(key, step, velocity=1, lag=0):
        when=start+step*mix.step+lag
        mix.put('drums',when,drums[key],DRUM_GAIN[key]*velocity,DRUM_PAN.get(key,0))
        if key=='kick':mix.kicks.append(seconds(when)%mix.n)
    kicks=(BOSS_KICKS if boss else KICKS[cue.stage])[idx%4]
    for step in kicks:
        if fill and step>=13:continue
        drum('kick',step,.97 if step in (0,8) else .79)
    if boss and cue.stage==2 and idx%2==0:
        drum('kick',15,.78)
    halftime=boss and idx%8 in (4,5)
    for step in ((8,) if halftime else (4,12)):
        if last and step==12:continue
        drum('snare',step,1.04 if step==12 else .98,.005)
    if idx%4 in (1,2):
        drum('ghost',7 if idx%4==1 else 10,.51,.007)
    for step in range(0,16,2):
        if fill and step>=12:continue
        if step==14 and idx%2==0:key='open'
        elif lift and idx%4<3:key='ride'
        else:key='hat'
        drum(key,step,(.87 if step%4==0 else .59)*(1+.06*math.sin(idx+step)),.002)
        if boss and idx%4==1 and step in (2,10):drum('hat',step+1,.36,.004)
    if idx%8==0 or (boss and idx%4==0):
        drum('crash2' if idx%16==8 else 'crash',0,1)
    if fill:
        if idx%8==7 or last:
            for at,key,vel in [(10,'snare',.62),(11,'snare',.46),(12,'tomHi',.84),(13,'tomMid',.76),(14,'tomLow',.89),(15,'snare',.80)]:drum(key,at,vel)
        else:
            for at,key,vel in [(13,'ghost',.66),(14,'tomHi',.71),(15,'tomMid',.74)]:drum(key,at,vel)

    next_chord=cue.bars[(idx+1)%len(cue.bars)].chords[0]
    for pos,length,interval in BASS[(cue.stage+(idx%4==3))%3]:
        root=cue.tonic-24+chord(pos)[0]
        while root>46:root-=12
        while root<31:root+=12
        pitch=root+interval
        if pos==14 and idx%2==1:
            target=cue.tonic-24+next_chord[0]
            while target-root>7:target-=12
            while target-root < -5:target+=12
            pitch=target-1 if next_chord!=chord(pos) else root+7
        gate=length*mix.step*(.79 if boss else .90)
        mix.put('bass',start+pos*mix.step+.002,bass_voice(pitch,gate,interval>0,bank),.75 if pos%4==0 else .66)

    if lift and idx%4!=3:
        strokes=((0,6),(7,1),(8,5),(14,2)) if not boss else ((0,4),(5,1),(6,2),(8,6),(15,1))
    else:
        strokes=GUITARS[2 if boss else cue.stage]
    for pos,length in strokes:
        if fill and pos>=14:continue
        root=cue.tonic-24+chord(pos)[0]
        while root<40:root+=12
        while root>53:root-=12
        ring=length>=4
        gate=length*mix.step*(.90 if ring else .70)
        mix.put('guitar',start+pos*mix.step+.004,chord_guitar(root,gate,ring,bank),.42 if ring else .40)


def melodic_section(mix,cue,bar,idx,bank):
    start=idx*16*mix.step
    lift=8<=idx<16
    def chord(step):
        return bar.chords[min(len(bar.chords)-1,int(step//(16/len(bar.chords))))]
    for pos,length,interval in bar.melody:
        pitch=cue.tonic+interval
        gate=length*mix.step*(.93 if length>=4 else .80)
        accented=pos in (0,8) or length>=4
        lead=fm_lead(pitch,gate,cue.stage,accented,cue.stage==2 or cue.boss,bank)
        mix.put('lead',start+pos*mix.step,lead, .50 if accented else .44,-.04)
        if (lift and length>=3) or (idx>=16 and pos==0):
            # The lead's harmony comes from the actual chord (including the raised dominant).
            chord_pitches=[cue.tonic+n+octave for n in chord(pos) for octave in (-12,0,12)]
            candidates=[n for n in chord_pitches if 3<=pitch-n<=7]
            if candidates:
                harmony=brass(max(candidates),gate*.95,True)
                mix.put('horn',start+pos*mix.step+.011,harmony,.24,.29)
    # Brass replies at the end of the call, then supports longer chorus notes.
    if lift:
        hits=((0,5),(8,5)) if idx%2==0 else ((2,4),(10,3))
    elif cue.boss:
        hits=((0,2.7),(6,1.5),(10,2.5)) if idx%2==0 else ((4,2),(12,2.5))
    else:
        hits=((6,1.8),(12,2.5)) if idx%2==0 else ((3,2.5),(10,2.5))
    for pos,length in hits:
        tones=chord(pos)
        for j,interval in enumerate(tones):
            note=cue.tonic+interval
            while note>74:note-=12
            while note<54:note+=12
            wave=brass(note,length*mix.step,lift)
            mix.put('horn',start+pos*mix.step+.009*j,wave,(.093 if lift else .12)*(1-.10*j),(-.35,.01,.41)[j])
    # A brief glassy answer in the right channel; leave room for the melody.
    if idx%4 in (1,3) or cue.stage==1:
        steps=(2,5,10,13) if cue.stage==1 else (10,12,14)
        for i,pos in enumerate(steps):
            tones=chord(pos)
            note=cue.tonic+tones[(idx+i)%len(tones)]+12
            while note>87:note-=12
            mix.put('keys',start+pos*mix.step+.009,bell(note,mix.step*1.3),.110 if cue.stage==1 else .078,.36)


def delay(stem, seconds_delay):
    return np.roll(stem,seconds(seconds_delay),axis=0)


def tiny_room(stem, decay, spread):
    # Circular early reflections preserve tails across the loop boundary.
    wet=np.zeros_like(stem)
    for t,lev in ((.021,.19),(.035,.17),(.052,.14),(.076,.11),(.104,.08),(.143,.07),(.193,.035)):
        wet[:,0]+=np.roll(stem[:,1],seconds(t*decay))*lev
        wet[:,1]+=np.roll(stem[:,0],seconds((t+spread)*decay))*lev
    return filtering(wet,'bandpass',(280,4900))


def master_mix(mix):
    s=mix.stems
    compression=np.ones(mix.n,np.float32)
    t=time_axis(.145)
    envelope=(1-.24*np.exp(-t/.053)).astype(np.float32)
    for start in mix.kicks:
        idx=(start+np.arange(len(t)))%mix.n
        compression[idx]=np.minimum(compression[idx],envelope)
    bass=s['bass']*compression[:,None]
    lead=s['lead']
    echo1=filtering(delay(lead,mix.beat*.75),'bandpass',(510,3800))
    echo2=filtering(delay(lead,mix.beat*1.5),'lowpass',3100)
    echo1*=np.array([.085,.19]);echo2*=np.array([.085,.045])
    room=tiny_room(s['drums'],1.0,.006)*.27 + tiny_room(lead+s['horn'],1.30,.009)*.18
    mixdown=(s['drums']+bass*.82+s['guitar']*.86+lead+s['horn']*.96+s['keys']+echo1+echo2+room)
    # Filter through the wrapped prefix, so the first downbeat has the same
    # filter history as the rest of the cycle.
    pad=seconds(.20)
    mixdown=filtering(np.concatenate([mixdown[-pad:],mixdown]),'highpass',30)[pad:]
    # Parallel bus saturation keeps the peaks round while the snare keeps its snap.
    mastered=.74*mixdown+.26*np.tanh(1.45*mixdown)/1.10
    rms=np.sqrt(np.mean(mastered.astype(np.float64)**2))
    drive=.190/max(.001,rms)
    driven=mastered*drive
    # A soft knee only acts on the occasional coincident kit/bass transient.
    knee=.68
    out=np.sign(driven)*(np.minimum(np.abs(driven),knee)+.205*np.tanh(np.maximum(np.abs(driven)-knee,0)/.205))
    return out.astype(np.float32)


def render(cue,bank,kit):
    mix=Mix(cue)
    for idx,bar in enumerate(cue.bars):
        rhythm_section(mix,cue,bar,idx,bank,kit)
        melodic_section(mix,cue,bar,idx,bank)
    return master_mix(mix)


def export(cue,wave,destination,masters):
    if masters:
        masters.mkdir(parents=True,exist_ok=True)
        wavfile.write(masters/(cue.slug+'.wav'),RATE,wave)
    dest=destination/(cue.slug+'.mp3')
    guard=seconds(GUARD)
    guarded=np.concatenate((wave[-guard:],wave,wave[:guard]))
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'guarded.wav'
        wavfile.write(path,RATE,guarded)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),
                        '-map_metadata','-1','-codec:a','libmp3lame','-q:a','3','-write_xing','1',
                        '-metadata','title='+cue.title,'-metadata','album=NEON STRIKER',str(dest)],check=True)
    print(f'{cue.title:23} {cue.bpm} BPM  {len(wave)/RATE:6.2f} s   {dest.stat().st_size//1024} KiB',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sf2',default=DEFAULT_BANK,type=Path)
    parser.add_argument('--out',default=ROOT/'dist/assets/music',type=Path)
    parser.add_argument('--masters',type=Path,help='optional location for uncompressed QA masters')
    parser.add_argument('--cue',choices=[cue.slug for cue in CUES],action='append')
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    bank=Bank(args.sf2)
    try:
        kit=make_drums(bank)
        for cue in CUES:
            if args.cue and cue.slug not in args.cue:continue
            export(cue,render(cue,bank,kit),args.out,args.masters)
    finally:
        bank.close()
    catalog = [[{'file':c.slug+'.mp3','bpm':c.bpm,'bars':len(c.bars)} for c in CUES if c.stage==stage]
               for stage in range(3)]
    (args.out/'cues.js').write_text('// Generated from music/score.py by music/render.py.\n'
                                    +'export const LOOP_GUARD = '+str(GUARD)+';\n'
                                    +'export const CUES = '+json.dumps(catalog,indent=2)+';\n')

if __name__=='__main__':
    main()
