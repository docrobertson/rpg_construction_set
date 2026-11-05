// The soundtrack's tunes, written out like a little tracker: for each mood
// a theme in two halves (A and B, eight bars each), a chord for every bar,
// and how the band plays it (gain evens out the loudness). Notes are
// "pitch/length" with the length in sixteenths (a bar is 16): "D5/4" is a
// crotchet D, "r/8" a minim's rest. Kept apart from the player (music.js) so
// the tunes can be checked bar by bar without a browser.

export const SONGS = {
  // the title: a slow heroic air in D minor, sung over a soft pad
  title: {
    bpm: 84, lead: 'pulse50', leadCut: 2400, echo: 0.3, arp: 'broken', bass: 'roots', drums: null, pad: 0.035,
    A: {
      chords: 'Dm Bb F C Dm Bb Gm A',
      tune: 'D5/6 E5/2 F5/4 A5/4 | G5/6 F5/2 D5/8 | C5/4 F5/4 A5/4 C6/4 | Bb5/6 A5/2 G5/8 | D5/6 E5/2 F5/4 A5/4 | D6/6 C6/2 Bb5/4 A5/4 | G5/4 Bb5/4 A5/4 G5/4 | A5/12 r/4',
    },
    B: {
      chords: 'Bb C Dm Dm Gm C F A',
      tune: 'F5/4 F5/2 G5/2 Bb5/8 | A5/4 G5/4 E5/8 | F5/6 E5/2 D5/8 | A4/4 D5/4 F5/4 E5/4 | D5/4 G5/4 Bb5/4 D6/4 | C6/6 Bb5/2 G5/8 | A5/4 C6/4 F5/4 A5/4 | E5/8 C#5/4 E5/4',
    },
  },
  // the open road: a bright marching tune in D, a walking bass beneath
  world: {
    bpm: 100, lead: 'pulse25', leadCut: 3200, echo: 0.2, arp: 'eighths', bass: 'walk', drums: 'soft', pad: 0.02,
    A: {
      chords: 'D G D A D G Bm A',
      tune: 'A4/3 D5/1 F#5/4 A5/4 F#5/4 | G5/6 F#5/2 E5/4 D5/4 | F#5/3 A5/1 D6/4 A5/4 F#5/4 | E5/12 r/4 | A4/3 D5/1 F#5/4 A5/4 B5/4 | D6/6 B5/2 G5/4 B5/4 | A5/4 F#5/4 D5/4 F#5/4 | E5/8 C#5/4 E5/4',
    },
    B: {
      chords: 'G A F#m Bm G A D D',
      tune: 'B5/4 B5/2 A5/2 G5/8 | A5/4 A5/2 G5/2 E5/8 | F#5/4 A5/4 C#6/4 A5/4 | D6/4 B5/4 F#5/8 | G5/2 A5/2 B5/4 D6/4 B5/4 | C#6/6 B5/2 A5/8 | D6/4 A5/4 F#5/4 A5/4 | D6/12 r/4',
    },
  },
  // towns: a skipping folk dance in G, oom-pah below
  town: {
    bpm: 120, gain: 1.5, lead: 'pulse25', leadCut: 3600, echo: 0.15, arp: 'oompah', bass: 'bounce', drums: 'light', pad: 0,
    A: {
      chords: 'G C G D G C D G',
      tune: 'D5/2 G5/2 G5/2 A5/2 B5/4 G5/4 | C6/4 B5/2 A5/2 G5/4 E5/4 | D5/2 G5/2 B5/2 D6/2 B5/4 G5/4 | A5/4 F#5/4 D5/8 | D5/2 G5/2 G5/2 A5/2 B5/4 G5/4 | E6/4 D6/2 C6/2 B5/4 A5/4 | G5/2 A5/2 B5/4 A5/4 F#5/4 | G5/12 r/4',
    },
    B: {
      chords: 'Em C G D C G D7 G',
      tune: 'B5/4 E6/4 D6/4 B5/4 | C6/4 E6/4 D6/2 C6/2 B5/4 | B5/4 D6/4 B5/2 A5/2 G5/4 | A5/8 F#5/4 A5/4 | G5/2 A5/2 G5/2 E5/2 C5/4 E5/4 | D5/4 G5/4 B5/4 D6/4 | C6/4 B5/4 A5/4 F#5/4 | G5/8 D5/4 G5/4',
    },
  },
  // dungeons: a slow, wary air in A minor; water drips in the dark
  dungeon: {
    bpm: 66, lead: 'tri', leadCut: 1800, echo: 0.42, arp: 'drips', bass: 'pedal', drums: 'heart', pad: 0.04,
    A: {
      chords: 'Am Dm F E Dm Am Bb E',
      tune: 'A4/8 C5/4 E5/4 | D5/8 C5/4 B4/4 | A4/12 r/4 | G#4/8 B4/8 | F5/8 E5/4 D5/4 | C5/8 B4/4 A4/4 | Bb4/8 A4/4 F4/4 | E4/12 r/4',
    },
    B: {
      chords: 'F E Am Am Dm E F E',
      tune: 'C5/8 A5/8 | G#5/8 E5/8 | A5/6 G5/2 E5/8 | r/16 | F5/6 E5/2 D5/8 | B4/8 G#4/8 | A4/4 C5/4 F5/8 | E5/16',
    },
  },
  // battle: a driving tune in E minor over pounding bass and drums
  combat: {
    bpm: 150, gain: 1.2, lead: 'pulse25', leadCut: 3000, echo: 0.12, arp: 'sixteenths', bass: 'drive', drums: 'full', pad: 0,
    A: {
      chords: 'Em Em C D Em Em C B',
      tune: 'E5/2 E5/2 G5/2 E5/2 B5/4 A5/4 | G5/4 F#5/4 E5/8 | E5/2 E5/2 G5/2 C6/2 B5/4 G5/4 | A5/6 F#5/2 D5/8 | E5/2 E5/2 G5/2 E5/2 B5/4 D6/4 | E6/4 D6/4 B5/8 | C6/4 B5/4 A5/4 G5/4 | F#5/8 D#5/8',
    },
    B: {
      chords: 'Am Em C D Am Em B B',
      tune: 'A5/4 C6/4 E6/4 C6/4 | B5/6 G5/2 E5/8 | C6/4 E6/4 D6/4 C6/4 | D6/6 C6/2 A5/8 | E6/4 E6/2 D6/2 C6/4 A5/4 | B5/4 G5/4 E5/4 G5/4 | F#5/4 A5/4 B5/4 D#6/4 | B5/8 r/8',
    },
  },
};

export const BAR = 16; // sixteenths in a bar

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "F#5" → 78 (MIDI); null for a rest
export function midiOf(name) {
  if (name === 'r') return null;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// "F#m" → { root: 6 (pitch class), tones: [0, 3, 7] }
const QUALITIES = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], sus4: [0, 5, 7] };
export function chordOf(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  if (!m || !QUALITIES[m[3]]) throw new Error(`Not a chord: ${sym}`);
  return { root: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, tones: QUALITIES[m[3]] };
}

// A half of a song, ready to play: bars of { chord, notes: [{ at, len, midi }] }
export function parseHalf(half) {
  const chords = half.chords.trim().split(/\s+/).map(chordOf);
  const bars = half.tune.split('|').map((b) => b.trim());
  if (bars.length !== chords.length) throw new Error(`${bars.length} bars of tune but ${chords.length} chords`);
  return bars.map((b, i) => {
    let at = 0;
    const notes = [];
    for (const tok of b.split(/\s+/)) {
      const [n, l] = tok.split('/');
      const len = +l;
      if (!(len > 0)) throw new Error(`Bad length in "${tok}"`);
      const midi = midiOf(n);
      if (midi != null) notes.push({ at, len, midi });
      at += len;
    }
    if (at !== BAR) throw new Error(`Bar ${i + 1} "${b}" lasts ${at} sixteenths, not ${BAR}`);
    return { chord: chords[i], notes };
  });
}

// A whole song: its A and B halves, played A B over and over
export function parseSong(song) {
  return [...parseHalf(song.A), ...parseHalf(song.B)];
}
