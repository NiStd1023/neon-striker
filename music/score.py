"""Original cues for NEON STRIKER. Each line is one bar of 4/4.

Numbers are scale degrees in natural minor (8 = upper tonic). The number
after a colon is the duration in sixteenths. Dots are rests. A slash
changes chord halfway through a bar. Notes and chords use concert pitch.
"""
from dataclasses import dataclass

MINOR = (0, 2, 3, 5, 7, 8, 10)
CHORDS = {
    'i': (0, 3, 7), 'VI': (8, 12, 15), 'III': (3, 7, 10),
    'VII': (10, 14, 17), 'iv': (5, 8, 12), 'IV': (5, 9, 12),
    'v': (7, 10, 14), 'V': (7, 11, 14), 'ii': (2, 5, 9),
    'bII': (1, 5, 8),
}


def degree(symbol):
    shift = 0
    if symbol[0] in '#b':
        shift = 1 if symbol[0] == '#' else -1
        symbol = symbol[1:]
    octave, note = divmod(int(symbol) - 1, 7)
    return 12 * octave + MINOR[note] + shift


@dataclass(frozen=True)
class Bar:
    chords: tuple
    melody: tuple


def section(score):
    result = []
    for line in score.strip().splitlines():
        chord, phrase = line.strip().split('|')
        changes = tuple(CHORDS[s] for s in chord.strip().split('/'))
        position = 0
        events = []
        for token in phrase.split():
            note, length = token.split(':')
            length = int(length)
            if note != '.':
                events.append((position, length, degree(note)))
            position += length
        if position != 16:
            raise ValueError(f'{position} sixteenths in {line}')
        result.append(Bar(changes, tuple(events)))
    return tuple(result)


@dataclass(frozen=True)
class Cue:
    slug: str
    title: str
    bpm: int
    tonic: int
    stage: int
    boss: bool
    bars: tuple


# A dotted upper-tonic call, an answer on the relative major,
# then a longer climbing line over open voicings.
harbor_a = section("""
i      | 5:2 8:3 7:1 8:5 .:1 5:2 3:2
VI     | 6:3 5:1 3:4 .:2 1:2 3:2 4:2
III    | 5:2 7:3 8:1 10:6 9:2 7:2
VII    | 9:4 7:2 4:3 .:1 4:2 5:2 7:2
i      | 5:2 8:3 7:1 8:4 10:2 9:2 8:2
VI     | 6:4 8:2 5:2 3:5 .:1 3:2
iv     | 4:3 6:1 8:4 11:3 10:1 8:2 6:2
V      | 5:4 .:2 5:2 #7:3 9:1 8:2 #7:2
""")
harbor_b = section("""
VI     | 10:6 8:2 6:3 5:1 3:4
VII    | 9:6 7:2 4:2 5:2 7:4
i      | 8:3 9:1 10:4 12:4 .:2 10:2
III    | 9:2 10:2 7:6 5:2 7:2 9:2
iv     | 11:6 10:2 8:4 6:2 8:2
VI     | 10:4 8:2 6:2 .:2 6:2 8:2 10:2
VII    | 11:3 9:1 7:4 9:4 11:4
V      | 12:6 .:2 5:2 6:2 #7:2 9:2
""")
harbor_turn = section("""
iv/V   | 4:2 6:2 8:3 6:1 5:4 #7:2 9:2
i/V    | 8:7 .:1 5:2 .:2 2:2 #7:2
""")

# A higher, skipping syncopation and a brighter Dorian IV in the canyon.
rift_a = section("""
i      | 8:3 .:1 10:2 9:2 8:3 5:1 8:4
IV     | 11:3 9:1 8:2 #6:2 .:2 4:2 #6:2 8:2
VII    | 9:2 11:2 12:3 11:1 9:4 7:2 5:2
i      | 10:5 .:1 9:2 8:3 5:1 3:2 5:2
VI     | 8:3 .:1 10:2 12:2 13:3 12:1 10:4
III    | 12:3 10:1 9:2 7:2 5:4 .:2 7:2
IV     | 8:2 9:2 11:4 13:2 12:2 11:2 9:2
V      | #7:3 9:1 12:4 9:3 .:1 5:2 #7:2
""")
rift_b = section("""
III    | 10:6 12:2 14:4 12:2 10:2
VII    | 11:4 9:3 7:1 .:2 7:2 9:2 11:2
IV     | 13:5 12:1 11:2 9:4 #6:2 8:2
i      | 10:8 .:2 8:2 9:2 10:2
VI     | 13:4 12:2 10:2 8:4 10:4
VII    | 14:4 11:2 9:2 7:4 .:2 9:2
IV     | 11:3 12:1 13:4 11:4 9:2 8:2
V      | 12:5 .:1 12:2 #7:4 9:2 #7:2
""")
rift_turn = section("""
IV/V   | 11:3 9:1 8:2 #6:2 5:3 #7:1 9:2 12:2
i/V    | 10:4 8:4 .:2 5:2 #7:2 9:2
""")

# The last airspace starts with clipped repeated notes and opens into
# a long-answer refrain above a galloping bass.
keep_a = section("""
i      | 3:2 3:1 .:1 5:2 8:2 7:2 8:4 5:2
VII    | 4:2 4:1 .:1 7:2 9:2 11:3 9:1 7:4
VI     | 3:2 3:1 .:1 6:2 8:2 10:4 8:2 6:2
V      | 5:4 #7:2 9:2 12:5 .:1 9:2
i      | 8:2 8:1 .:1 10:2 12:2 10:3 9:1 8:2 5:2
III    | 7:4 10:2 9:2 7:2 5:2 3:4
iv     | 4:3 5:1 6:2 8:2 11:4 10:2 8:2
V      | 9:4 .:2 5:2 #7:3 9:1 #7:4
""")
keep_b = section("""
i      | 12:6 10:2 8:4 9:2 10:2
VI     | 13:5 12:1 10:2 8:4 .:2 6:2
III    | 10:4 12:2 14:2 12:4 10:4
VII    | 11:6 9:2 7:2 4:2 7:2 9:2
iv     | 11:6 10:2 8:3 6:1 4:4
i      | 12:5 10:1 8:2 5:4 8:2 10:2
VI/VII | 13:4 10:2 8:2 11:4 9:2 7:2
V      | 12:7 .:1 5:3 #7:1 9:2 #7:2
""")
keep_turn = section("""
iv/V   | 4:2 6:2 8:2 11:2 12:3 9:1 #7:4
i/V    | 8:6 .:2 5:1 6:1 5:2 2:2 #7:2
""")

# Boss 1: a stomping minor-second brass challenge with a sweeping reply.
wing = section("""
i      | 1:3 .:1 1:2 5:2 8:5 7:1 5:2
bII    | b9:3 8:1 b9:4 .:2 6:2 4:2 b2:2
i      | 3:3 .:1 3:2 5:2 10:4 8:2 5:2
V      | #7:3 5:1 2:4 .:2 5:2 6:2 #7:2
VI     | 6:4 8:2 10:2 13:4 12:2 10:2
iv     | 11:6 8:2 6:4 4:2 6:2
bII    | b9:2 8:2 6:4 4:2 6:2 b9:4
V      | #7:5 .:1 5:2 #7:3 9:1 12:4
i      | 8:3 .:1 8:2 10:2 12:5 10:1 8:2
VI     | 13:6 12:2 10:4 8:2 6:2
VII    | 7:3 .:1 7:2 9:2 11:4 9:2 7:2
III    | 10:6 7:2 5:4 7:2 9:2
iv     | 11:4 10:2 8:2 6:4 8:2 11:2
bII    | b9:6 6:2 4:4 b2:2 4:2
V      | 5:3 .:1 5:2 #7:2 9:2 #7:2 5:4
i/V    | 8:6 .:2 #7:2 5:2 2:2 #7:2
""")
warden = section("""
i      | 5:2 8:1 5:1 .:2 5:2 10:3 9:1 8:4
iv     | 4:2 8:1 4:1 .:2 6:2 11:4 8:2 6:2
VI     | 6:2 8:2 10:3 8:1 13:3 12:1 10:4
V      | 9:4 #7:2 5:2 .:2 5:2 #7:2 9:2
bII    | b9:4 11:4 13:3 11:1 b9:4
i      | 12:6 10:2 8:3 5:1 3:4
iv     | 8:2 11:2 13:4 11:3 8:1 6:4
V      | 5:3 .:1 #7:3 .:1 9:3 #7:1 5:4
i      | 12:2 10:1 8:1 .:2 8:2 15:5 14:1 12:2
VII    | 14:6 11:2 9:4 7:2 9:2
VI     | 13:2 10:1 8:1 .:2 8:2 13:4 12:2 10:2
III    | 12:6 10:2 7:4 5:2 7:2
iv     | 11:3 13:1 15:4 13:4 11:2 8:2
bII    | b9:4 11:2 13:2 11:4 6:2 4:2
V      | 5:2 9:2 #7:2 5:2 #7:4 9:2 12:2
i/V    | 8:7 .:1 5:2 .:2 6:2 #7:2
""")
eclipse = section("""
i      | 1:2 .:1 1:1 5:3 3:1 8:4 5:2 3:2
bII    | b2:2 .:1 b2:1 6:3 4:1 b9:4 6:2 4:2
i      | 3:2 .:1 3:1 8:3 5:1 10:4 8:2 5:2
V      | 5:2 .:1 5:1 #7:3 9:1 12:4 9:2 #7:2
VI     | 10:6 8:2 6:4 8:2 10:2
VII    | 11:6 9:2 7:2 4:2 7:2 9:2
bII    | 11:3 b9:1 6:4 4:3 6:1 b9:4
V      | 12:5 .:1 9:2 #7:4 5:2 #7:2
i      | 8:2 .:1 8:1 10:3 9:1 12:4 10:2 8:2
III    | 7:2 .:1 7:1 10:3 12:1 14:4 12:2 10:2
iv     | 11:6 13:2 15:4 13:2 11:2
VI     | 13:4 12:2 10:2 8:4 6:2 8:2
bII    | b9:2 11:2 13:4 11:3 b9:1 6:4
i      | 12:5 10:1 8:2 5:4 8:2 10:2
iv/V   | 11:4 8:2 6:2 5:3 #7:1 9:2 12:2
i/V    | 8:6 .:2 5:1 6:1 5:2 #7:2 2:2
""")

CUES = (
    Cue('harbor-flight', 'Afterburn Dawn', 164, 64, 0, False, harbor_a + harbor_b + harbor_a[:6] + harbor_turn),
    Cue('rift-flight', 'Emerald Slipstream', 170, 57, 1, False, rift_a + rift_b + rift_a[:6] + rift_turn),
    Cue('keep-flight', 'Above the Redline', 176, 62, 2, False, keep_a + keep_b + keep_a[:6] + keep_turn),
    Cue('harbor-boss', 'Crimson Interceptor', 178, 64, 0, True, wing),
    Cue('rift-boss', 'Crystal Overdrive', 184, 57, 1, True, warden),
    Cue('keep-boss', 'Eclipse Breaker', 188, 62, 2, True, eclipse),
)
