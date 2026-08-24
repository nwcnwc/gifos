(function () {
'use strict';

/* ---- src/dimensions.js ---- */
var WIDTH = 768
var HEIGHT = 480


/* ---- src/create.js ---- */
var create = (name) => (
  document.createElementNS('http://www.w3.org/2000/svg', name)
)


/* ---- src/sleep.js ---- */
var sleep = (delay) => new Promise((resolve, reject) => {
  let start = performance.now()
  requestAnimationFrame(function check (now) {
    if (now >= start + delay) return resolve()
    requestAnimationFrame(check)
  })
})


/* ---- src/tinymusic.js ---- */
/*
 * Private stuffz
 */

var enharmonics = 'B#-C|C#-Db|D|D#-Eb|E-Fb|E#-F|F#-Gb|G|G#-Ab|A|A#-Bb|B-Cb',
  middleC = 440 * Math.pow( Math.pow( 2, 1 / 12 ), -9 ),
  numeric = /^[0-9.]+$/,
  octaveOffset = 4,
  space = /\s+/,
  num = /(\d+)/,
  offsets = {};

// populate the offset lookup (note distance from C, in semitones)
enharmonics.split('|').forEach(function( val, i ) {
  val.split('-').forEach(function( note ) {
    offsets[ note ] = i;
  });
});

/*
 * Note class
 *
 * new Note ('A4 q') === 440Hz, quarter note
 * new Note ('- e') === 0Hz (basically a rest), eigth note
 * new Note ('A4 es') === 440Hz, dotted eighth note (eighth + sixteenth)
 * new Note ('A4 0.0125') === 440Hz, 32nd note (or any arbitrary
 * divisor/multiple of 1 beat)
 *
 */

// create a new Note instance from a string
var Note = function Note( str ) {
  var couple = str.split( space );
  // frequency, in Hz
  this.frequency = Note.getFrequency( couple[ 0 ] ) || 0;
  // duration, as a ratio of 1 beat (quarter note = 1, half note = 0.5, etc.)
  this.duration = Note.getDuration( couple[ 1 ] ) || 0;
}

// convert a note name (e.g. 'A4') to a frequency (e.g. 440.00)
Note.getFrequency = function( name ) {
  var couple = name.split( num ),
    distance = offsets[ couple[ 0 ] ],
    octaveDiff = ( couple[ 1 ] || octaveOffset ) - octaveOffset,
    freq = middleC * Math.pow( Math.pow( 2, 1 / 12 ), distance );
  return freq * Math.pow( 2, octaveDiff );
};

// convert a duration string (e.g. 'q') to a number (e.g. 1)
// also accepts numeric strings (e.g '0.125')
// and compund durations (e.g. 'es' for dotted-eight or eighth plus sixteenth)
Note.getDuration = function( symbol ) {
  return numeric.test( symbol ) ? parseFloat( symbol ) :
    symbol.toLowerCase().split('').reduce(function( prev, curr ) {
      return prev + ( curr === 'w' ? 4 : curr === 'h' ? 2 :
        curr === 'q' ? 1 : curr === 'e' ? 0.5 :
        curr === 's' ? 0.25 : 0 );
    }, 0 );
};

/*
 * Sequence class
 */

// create a new Sequence
var Sequence = function Sequence( ac, tempo, arr ) {
  this.ac = ac || new AudioContext();
  this.createFxNodes();
  this.tempo = tempo || 120;
  this.loop = true;
  this.smoothing = 0;
  this.staccato = 0;
  this.notes = [];
  this.push.apply( this, arr || [] );
}

// create gain and EQ nodes, then connect 'em
Sequence.prototype.createFxNodes = function() {
  var eq = [ [ 'bass', 100 ], [ 'mid', 1000 ], [ 'treble', 2500 ] ],
    prev = this.gain = this.ac.createGain();
  eq.forEach(function( config, filter ) {
    filter = this[ config[ 0 ] ] = this.ac.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = config[ 1 ];
    prev.connect( prev = filter );
  }.bind( this ));
  prev.connect( this.ac.destination );
  return this;
};

// accepts Note instances or strings (e.g. 'A4 e')
Sequence.prototype.push = function() {
  Array.prototype.forEach.call( arguments, function( note ) {
    this.notes.push( note instanceof Note ? note : new Note( note ) );
  }.bind( this ));
  return this;
};

// create a custom waveform as opposed to "sawtooth", "triangle", etc
Sequence.prototype.createCustomWave = function( real, imag ) {
  // Allow user to specify only one array and dupe it for imag.
  if ( !imag ) {
    imag = real;
  }

  // Wave type must be custom to apply period wave.
  this.waveType = 'custom';

  // Reset customWave
  this.customWave = [ new Float32Array( real ), new Float32Array( imag ) ];
};

// recreate the oscillator node (happens on every play)
Sequence.prototype.createOscillator = function() {
  this.stop();
  this.osc = this.ac.createOscillator();

  // customWave should be an array of Float32Arrays. The more elements in
  // each Float32Array, the dirtier (saw-like) the wave is
  if ( this.customWave ) {
    this.osc.setPeriodicWave(
      this.ac.createPeriodicWave.apply( this.ac, this.customWave )
    );
  } else {
    this.osc.type = this.waveType || 'square';
  }

  this.osc.connect( this.gain );
  return this;
};

// schedules this.notes[ index ] to play at the given time
// returns an AudioContext timestamp of when the note will *end*
Sequence.prototype.scheduleNote = function( index, when ) {
  var duration = 60 / this.tempo * this.notes[ index ].duration,
    cutoff = duration * ( 1 - ( this.staccato || 0 ) );

  this.setFrequency( this.notes[ index ].frequency, when );

  if ( this.smoothing && this.notes[ index ].frequency ) {
    this.slide( index, when, cutoff );
  }

  this.setFrequency( 0, when + cutoff );
  return when + duration;
};

// get the next note
Sequence.prototype.getNextNote = function( index ) {
  return this.notes[ index < this.notes.length - 1 ? index + 1 : 0 ];
};

// how long do we wait before beginning the slide? (in seconds)
Sequence.prototype.getSlideStartDelay = function( duration ) {
  return duration - Math.min( duration, 60 / this.tempo * this.smoothing );
};

// slide the note at <index> into the next note at the given time,
// and apply staccato effect if needed
Sequence.prototype.slide = function( index, when, cutoff ) {
  var next = this.getNextNote( index ),
    start = this.getSlideStartDelay( cutoff );
  this.setFrequency( this.notes[ index ].frequency, when + start );
  this.rampFrequency( next.frequency, when + cutoff );
  return this;
};

// set frequency at time
Sequence.prototype.setFrequency = function( freq, when ) {
  this.osc.frequency.setValueAtTime( freq, when );
  return this;
};

// ramp to frequency at time
Sequence.prototype.rampFrequency = function( freq, when ) {
  this.osc.frequency.linearRampToValueAtTime( freq, when );
  return this;
};

// run through all notes in the sequence and schedule them
Sequence.prototype.play = function( when ) {
  when = typeof when === 'number' ? when : this.ac.currentTime;

  this.createOscillator();
  this.osc.start( when );

  this.notes.forEach(function( note, i ) {
    when = this.scheduleNote( i, when );
  }.bind( this ));

  this.osc.stop( when );
  this.osc.onended = this.loop ? this.play.bind( this, when ) : null;

  return this;
};

// stop playback, null out the oscillator, cancel parameter automation
Sequence.prototype.stop = function() {
  if ( this.osc ) {
    this.osc.onended = null;
    this.osc.disconnect();
    this.osc = null;
  }
  return this;
};


/* ---- src/keys.js ---- */
var DOWN = new Set
var PRESSED = new Set

const NO_DEFAULT = new Set([
  'w',
  'a',
  's',
  'd',
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
])

var upKey = () => (
  DOWN.has('w') || DOWN.has('ArrowUp') || PRESSED.has(0) || PRESSED.has(12)
)

var leftKey = () => (
  DOWN.has('a') || DOWN.has('ArrowLeft') || PRESSED.has(14)
)

var rightKey = () => (
  DOWN.has('d') || DOWN.has('ArrowRight') || PRESSED.has(15)
)

document.addEventListener('keydown', (event) => {
  DOWN.add(event.key)
  if (NO_DEFAULT.has(event.key)) event.preventDefault()
})

document.addEventListener('keyup', ({key}) => {
  DOWN.delete(key)
})

const HANDLERS = new Map
var onPress = (index, f) => {
  if (!HANDLERS.has(index)) HANDLERS.set(index, [])
  HANDLERS.get(index).push(f)
}

requestAnimationFrame(function tick (time) {
  const pad = navigator.getGamepads()[0]
  if (!pad) {
    PRESSED.clear()
    return
  }
  pad.buttons.forEach((button, index) => {
    if (button.pressed) {
      if (!PRESSED.has(index)) {
        const handlers = HANDLERS.get(index)
        if (handlers) handlers.forEach((f) => f())
      }
      PRESSED.add(index)
    } else {
      PRESSED.delete(index)
    }
  })
  requestAnimationFrame(tick)
})


/* ---- src/body.js ---- */
class Body {
  constructor (element) {
    this.element = element
    this.bounds = {}
  }

  get hidden () {
    return this.element.hasAttribute('hidden')
  }

  set hidden (value) {
    if (value) {
      this.element.setAttribute('hidden', '')
    } else {
      this.element.removeAttribute('hidden')
    }
  }

  get x () {
    return this._x
  }

  set x (value) {
    this._x = value || 0
    this.element.setAttribute('x', Math.round(this.x))
  }

  get y () {
    return this._y
  }

  set y (value) {
    this._y = value || 0
    this.element.setAttribute('y', Math.round(this.y))
  }

  get width () {
    return this._width
  }

  set width (value) {
    this._width = Math.max(0, value || 0)
    this.element.setAttribute('width', Math.round(this.width))
  }

  get height () {
    return this._height
  }

  set height (value) {
    this._height = Math.max(0, value || 0)
    this.element.setAttribute('height', Math.round(this.height))
  }

  get top () {
    return this.y
  }

  get bottom () {
    return this.y + this.height
  }

  set bottom (value) {
    this.y = (value || 0) - this.height
  }

  get left () {
    return this.x
  }

  get right () {
    return this.x + this.width
  }

  set right (value) {
    this.x = (value || 0) - this.width
  }

  set bottom (value) {
    this.y = value - this.height
  }

  isLeftOf (other) {
    return this.right <= other.left
  }

  isRightOf (other) {
    return this.left >= other.right
  }

  isAbove (other) {
    return this.bottom <= other.top
  }

  isBelow (other) {
    return this.top >= other.bottom
  }

  overlaps (other) {
    return this.left < other.right &&
    this.right > other.left &&
    this.top < other.bottom &&
    this.bottom > other.top
  }

  append ({element}) {
    this.element.appendChild(element)
  }

  remove () {
    this.element.remove()
  }
}


/* ---- src/guy.js ---- */



class Guy extends Body {
  constructor (x, y) {
    super(create('svg'))
    this.element.innerHTML = `
    <svg id="guy">
      <g id="inner-guy">
        <rect class="accent" x="0" y="17" width="24" height="21"/>
        <rect id="left_foot" class="accent" x="4" y="38" width="6" height="10"/>
        <rect id="right_foot" class="accent" x="14" y="38" width="6" height="10"/>
        <g id="head">
          <rect class="accent" x="0" y="0" width="26" height="19"/>
          <rect id="face" x="4" y="3" width="20" height="14"/>
          <rect class="accent" x="9" y="7" width="4" height="4"/>
          <rect class="accent" x="17" y="7" width="4" height="4"/>
        </g>
      </g>
    </svg>`
    this.load(x, y)
    this.height = 48
    this.width = 26
    this.speed = 360
    this.vx = 0
    this.vy = 0
  }

  tick (scale) {
    if (leftKey() && !rightKey()) {
      this.vx = -scale(this.speed)
      this.faceLeft = true
    } else if (rightKey() && !leftKey()) {
      this.vx = scale(this.speed)
      this.faceLeft = false
    } else {
      this.vx = 0
    }

    this.walking = leftKey() || rightKey()
  }

  get faceLeft () {
    return !!this._faceLeft
  }

  set faceLeft (value) {
    this._faceLeft = !!value
    this.element.classList.toggle('left', this.faceLeft)
  }

  get walking () {
    return !!this._walking
  }

  set walking (value) {
    this._walking = !!value
    this.element.classList.toggle('walk', this.walking)
  }

  load (x, y) {
    this.x = x
    this.y = y
  }

  toJSON () {
    return [Math.round(this.x), Math.round(this.y)]
  }
}


/* ---- src/goal.js ---- */


class Goal extends Body {
  constructor (x, y) {
    super(create('svg'))
    this.element.innerHTML = `
    <svg id="goal"><g id="inner-goal"><g id="inner-goal-finish">
      <path d="M12 19.26L6.37 22.1a1 1 0 0 1-1.44-1.07l1.05-5.98-4.47-4.22a1 1 0 0 1 .55-1.72l6.22-.88 2.83-5.5a1 1 0 0 1 1.78 0l2.83 5.5 6.22.88a1 1 0 0 1 .55 1.72l-4.47 4.22 1.05 5.98a1 1 0 0 1-1.44 1.07L12 19.26z"/>
    </g></g></svg>`
    this.width = 22
    this.height = 20
    this.load(x, y)
  }

  load (x, y) {
    this.x = x
    this.y = y
  }

  toJSON () {
    return [Math.round(this.x), Math.round(this.y)]
  }
}


/* ---- src/bar.js ---- */


class Bar extends Body {
  constructor (x, y, width, height, on) {
    super(create('rect'))
    this.width = width
    this.height = height
    this.x = x
    this.y = y
    this.on = on
  }

  get on () {
    return !!this._on
  }

  set on (value) {
    this._on = !!value
    this.element.classList.toggle('light', this.on)
    this.element.classList.toggle('dark', !this.on)
  }

  toJSON () {
    return [
      Math.round(this.x),
      Math.round(this.y),
      Math.round(this.width),
      Math.round(this.height),
      Number(this.on)
    ]
  }
}


/* ---- src/spikes.js ---- */


class Spikes extends Body {
  constructor (x, y, width, height, on, direction) {
    super(create('svg'))
    this.rect = create('rect')
    this.rect.setAttribute('x', '0')
    this.rect.setAttribute('y', '0')
    this.rect.setAttribute('width', '100%')
    this.rect.setAttribute('height', '100%')
    this.element.appendChild(this.rect)
    this.width = width
    this.height = height
    this.x = x
    this.y = y
    this.on = on
    this.direction = direction
  }

  get isUp () {
    return this.direction === 'up'
  }

  get isDown () {
    return this.direction === 'down'
  }

  get isLeft () {
    return this.direction === 'left'
  }

  get isRight () {
    return this.direction === 'right'
  }

  get width () {
    return super.width
  }

  set width (value) {
    super.width = value
    if (this.isUp || this.isDown) {
      this.element.setAttribute('width', Math.round(this.width / 16) * 16)
    }
  }

  get height () {
    return super.height
  }

  set height (value) {
    super.height = value
    if (this.isLeft || this.isRight) {
      this.element.setAttribute('height', Math.round(this.height / 16) * 16)
    }
  }

  get on () {
    return !!this._on
  }

  set on (value) {
    this._on = !!value
    this.element.classList.toggle('light', this.on)
    this.element.classList.toggle('dark', !this.on)
  }

  get direction () {
    return this._direction
  }

  set direction (value) {
    this._direction = value
    this.rect.setAttribute('fill', `url(#spike-${this.direction})`)
  }

  toJSON () {
    return [
      Math.round(this.x),
      Math.round(this.y),
      this.isUp || this.isDown ? Math.round(this.width / 16) * 16 : this.width,
      this.isLeft || this.isRight ? Math.round(this.height / 16) * 16 : this.height,
      Number(this.on),
      this.direction
    ]
  }
}


/* ---- src/counter.js ---- */


class Counter extends Body {
  constructor (element) {
    super(element)
    this.value = 0
  }

  get value () {
    return this._value
  }

  set value (value) {
    this._value = value || 0

    this.element.innerHTML = ''
    let index = 0
    for (let c of this.value.toString()) {
      const number = new Body(create('rect'))
      number.element.setAttribute('fill', `url(#n${c})`)
      number.width = 10
      number.height = 16
      number.x = 12 * index++
      this.append(number)
    }
  }
}


/* ---- src/sound.js ---- */

const ac = new AudioContext()

var MUSIC_LOW_A = new Sequence(ac, 100, [
  'B2 q',
  '- q',
  'Db3 q',
  '- q',
  'D3 q',
  '- q',
  'Gb3 q',
  'Bb3 q',
  'B2 q',
  '- q',
  'Db3 q',
  '- q',
  'D3 q',
  '- q',
  'Gb3 q',
  'B2 q',
  'B2 q',
  '- q',
  'Db3 q',
  '- q',
  'D3 q',
  '- q',
  'Gb3 q',
  'Bb3 q',
  'B2 q',
  '- q',
  'Db3 q',
  '- q',
  'D3 q',
  '- q',
  'Gb3 q',
  'B2 q',
  '- 32'
])

var MUSIC_MID_A = new Sequence(ac, 100, [
  '- w',
  '- h',
  'D3 q',
  'Db3 q',
  '- w',
  '- h',
  'D3 q',
  'Gb3 q',
  '- w',
  '- h',
  'D3 q',
  'Db3 q',
  '- w',
  '- h',
  'D3 q',
  'Gb3 q',
  '- 32'
])

var MUSIC_HIGH_A = new Sequence(ac, 100, [
  'B4 e',
  '- e',
  'Bb4 e',
  '- e',
  'A4 s',
  'A4 s',
  'Ab4 e',
  'G4 e',
  '- e',
  'Gb4 s',
  'B4 s',
  'Gb4 e',
  'D4 e',
  'B3 e',
  'D4 e',
  '- e',
  'Db4 e',
  '- e',
  'B4 e',
  '- e',
  'Bb4 e',
  '- e',
  'A4 s',
  'A4 s',
  'Ab4 e',
  'G4 e',
  '- e',
  'Gb4 s',
  'B4 s',
  'Gb4 e',
  'D4 e',
  'B3 e',
  'D4 e',
  'Db4 e',
  'B3 e',
  '- e',
  'B4 e',
  '- e',
  'Bb4 e',
  '- e',
  'A4 s',
  'A4 s',
  'Ab4 e',
  'G4 e',
  '- e',
  'Gb4 s',
  'B4 s',
  'Gb4 e',
  'D4 e',
  'B3 e',
  'D4 e',
  '- e',
  'Db4 e',
  '- e',
  'B4 e',
  '- e',
  'Bb4 e',
  '- e',
  'A4 s',
  'A4 s',
  'Ab4 e',
  'G4 e',
  '- e',
  'Gb4 s',
  'B4 s',
  'Gb4 e',
  'D4 e',
  'B3 e',
  'D4 e',
  'Db4 e',
  'B3 e',
  '- e',
  '- 32'
])

var MUSIC_LOW_B = new Sequence(ac, 100, [
  '- 32',
  'G3 e',
  'E3 e',
  'D3 e',
  'C3 e',
  'A2 e',
  'G2 e',
  'C2 e',
  'Bb2 e',
  'B2 e',
  'Db3 e',
  'D3 e',
  'E3 e',
  'Gb3 e',
  'G3 e',
  'Gb3 e',
  'Bb2 e',
  'G3 e',
  'E3 e',
  'D3 e',
  'C3 e',
  'A2 e',
  'G2 e',
  'C2 e',
  'Bb2 e',
  'B2 e',
  'Db3 e',
  'D3 e',
  'E3 e',
  'D3 e',
  'Db3 e',
  'B2 e',
  '- e',
  'G3 e',
  'E3 e',
  'D3 e',
  'C3 e',
  'A2 e',
  'G2 e',
  'C2 e',
  'Bb2 e',
  'B2 e',
  'Db3 e',
  'D3 e',
  'E3 e',
  'Gb3 e',
  'G3 e',
  'Gb3 e',
  'Bb2 e',
  'G3 e',
  'E3 e',
  'D3 e',
  'C3 e',
  'A2 e',
  'G2 e',
  'C2 e',
  'Bb2 e',
  'B2 e',
  'Db3 e',
  'D3 e',
  'E3 e',
  'D3 e',
  'Db3 e',
  'B2 e',
  '- e'
])

var MUSIC_MID_B = new Sequence(ac, 100, [
  '- 32',
  'G4 w',
  'Gb4 w',
  'G4 w',
  'Gb4 w',
  'G4 w',
  'Gb4 w',
  'G4 w',
  'Gb4 w'
])

var MUSIC_HIGH_B = new Sequence(ac, 100, [
  '- 32',
  'C4 w',
  'D4 w',
  'C4 w',
  'D4 w',
  'C4 w',
  'D4 w',
  'C4 w',
  'D4 w'
])

var MUSIC_WINNING_LOW = new Sequence(ac, 200, [
  'C3 q',
  '- q',
  'G3 q',
  '- q',
  'C3 q',
  '- q',
  'G3 q',
  'G2 q',
  'C3 q',
  '- q',
  'G3 q',
  '- q',
  'B2 q',
  '- q',
  'B2 q',
  'A2 q',
  'G2 q',
  '- h',
  '- q',
  'E3 q',
  '- h',
  '- q',
  'G2 q',
  '- w',
  '- h',
  'B2 q'
])

var MUSIC_WINNING_HIGH = new Sequence(ac, 200, [
  'G4 e',
  'Gb4 e',
  'G4 e',
  'Gb4 e',
  'G4 q',
  'A4 q',
  'G4 h',
  'C4 q',
  'E4 q',
  'G4 e',
  'Gb4 e',
  'G4 e',
  'Gb4 e',
  'G4 q',
  'E4 q',
  'F4 h',
  'D4 q',
  'E4 q',
  'F4 e',
  'E4 e',
  'F4 e',
  'E4 e',
  'F4 q',
  'G4 q',
  'E4 e',
  'D4 e',
  'E4 e',
  'D4 e',
  'E4 q',
  'F4 q',
  'G3 e',
  'A3 e',
  'B3 e',
  'C4 e',
  'D4 e',
  'E4 e',
  'F4 e',
  'E4 e',
  'D4 e',
  'C4 e',
  'B3 e',
  'A3 e',
  'G3 q',
  'E4 q'
])

MUSIC_WINNING_LOW.staccato = 0.3
MUSIC_WINNING_HIGH.staccato = 0.5

MUSIC_WINNING_LOW.waveType = 'sine'

MUSIC_WINNING_LOW.gain.gain.value = 0.7
MUSIC_WINNING_HIGH.gain.gain.value = 0.3


MUSIC_LOW_A.staccato = 0.5
MUSIC_LOW_B.staccato = 0.3
MUSIC_MID_A.staccato = 0.5
MUSIC_HIGH_A.staccato = 0.5

MUSIC_LOW_A.waveType = 'sine'
MUSIC_LOW_B.waveType = 'sine'
MUSIC_MID_A.waveType = 'sine'

MUSIC_LOW_A.gain.gain.value = 0.4
MUSIC_LOW_B.gain.gain.value = 0.6
MUSIC_MID_A.gain.gain.value = 0.4
MUSIC_HIGH_A.gain.gain.value = 0.4

// Fade the Mid/High B in and out

let fade = 1
let direction = 'up'

setInterval(function() {
  if (direction === 'up') {
    fade += 1
    if (fade > 9) {
      direction = 'down'
      fade -= 1
    }
  }

  if (direction === 'down') {
    fade -= 1
    if (fade < 1) {
      direction = 'up'
      fade += 2
    }
  }

  MUSIC_MID_B.gain.gain.value = fade * 0.01
  MUSIC_HIGH_B.gain.gain.value = fade * 0.01
}, 300)

var playMusic = () => {
  MUSIC_LOW_A.play()
  MUSIC_MID_A.play()
  MUSIC_HIGH_A.play()
  MUSIC_LOW_B.play()
  MUSIC_MID_B.play()
  MUSIC_HIGH_B.play()
  MUSIC_WINNING_LOW.stop()
  MUSIC_WINNING_HIGH.stop()
}

var playWin = () => {
  MUSIC_LOW_A.stop()
  MUSIC_MID_A.stop()
  MUSIC_HIGH_A.stop()
  MUSIC_LOW_B.stop()
  MUSIC_MID_B.stop()
  MUSIC_HIGH_B.stop()
  MUSIC_WINNING_LOW.play()
  MUSIC_WINNING_HIGH.play()
}

playMusic()

//  Sound Effects

var JUMP_FX = new Sequence(ac, 320, [
  'Bb3 e',
  'G5 e',
  'Bb4 e'
])

var ON_FX = new Sequence(ac, 400, [
  'Bb6 e',
  'D6 e'
])

var OFF_FX = new Sequence(ac, 400, [
  'D6 e',
  'Bb6 e'
])

var GOAL_FX = new Sequence(ac, 280, [
  'C4 s',
  'G4 s',
  'C5 h'
])

var DEATH_FX = new Sequence(ac, 280, [
  'Bb3 e',
  'Bb2 q'
])

JUMP_FX.loop = false
GOAL_FX.loop = false
DEATH_FX.loop = false
ON_FX.loop = false
OFF_FX.loop = false

JUMP_FX.smoothing = 1
DEATH_FX.smoothing = 0.5

GOAL_FX.staccato = 0.2
ON_FX.staccato = 0.5
OFF_FX.staccato = 0.5

DEATH_FX.waveType = 'sawtooth'

DEATH_FX.bass.gain.value = 10

JUMP_FX.gain.gain.value = 0.3
GOAL_FX.gain.gain.value = 0.6
DEATH_FX.gain.gain.value = 0.4
ON_FX.gain.gain.value = 0.3
OFF_FX.gain.gain.value = 0.3


/* ---- src/title.js ---- */

const START = 0
const CONTROLS = 1
const EDITOR = 2
const ITEMS = [START, CONTROLS, EDITOR]

class Title extends Body {
  constructor (game) {
    super(document.getElementById('title'))
    this.game = game
    this.items = [].slice.call(this.element.querySelectorAll('.menu .item'))
    this.selected = START
  }

  keydown ({key}) {
    switch (key) {
      case 'ArrowUp':
        this.selected -= 1
        break
      case 'ArrowDown':
        this.selected += 1
        break
      case 'Enter':
        this.choose()
        break
    }
  }

  choose () {
    switch (this.selected) {
      case START:
        this.game.scene.index = 0
        this.game.scene.paused = false
        this.game.state = 'play'
        break
      case EDITOR:
        this.game.state = 'edit'
        break
      case CONTROLS:
        this.game.state = 'controls'
        break
    }
  }

  get selected () {
    return this._selected
  }

  set selected (value) {
    this._selected = Math.min(ITEMS.length - 1, Math.max(0, value || 0))

    this.items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selected)
    })
  }
}


/* ---- src/controls.js ---- */


class Key extends Body {
  constructor (id, pressed) {
    super(document.getElementById(id))
    this.pressed = pressed
  }

  tick () {
    this.element.classList.toggle('dark', !this.pressed())
    this.element.classList.toggle('light', this.pressed())
  }
}

class Controls extends Body {
  constructor (game) {
    super(document.getElementById('controls'))
    this.game = game
    this.keys = [
      new Key('key-w', () => DOWN.has('w')),
      new Key('key-a', () => DOWN.has('a')),
      new Key('key-d', () => DOWN.has('d')),
      new Key('key-space', () => DOWN.has(' ')),
      new Key('button-toggle', () => PRESSED.has(1)),
      new Key('button-jump', () => PRESSED.has(0)),
      new Key('button-left', () => PRESSED.has(14)),
      new Key('button-right', () => PRESSED.has(15)),
    ]
  }

  keydown ({key}) {
    switch (key) {
      case 'Enter':
        this.game.state = 'title'
        break
      case 'ArrowUp':
      case 'ArrowDown':
        this.element.querySelector('.menu .item').classList.add('selected')
        break
    }
  }

  tick () {
    if (this.hidden) return
    for (const key of this.keys) key.tick()
  }
}


/* ---- src/editor.js ---- */







const PADDING = 3

const svg = document.getElementById('editor')
const point = svg.createSVGPoint()
const translate = ({clientX, clientY}) => {
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(svg.getScreenCTM().inverse())
}

let drag = null
let previous = null

document.addEventListener('mouseup', () => {
  drag = previous = null
})

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  previous = translate(event)
})

document.addEventListener('mousemove', (event) => {
  if (!drag) return
  const {x, y} = translate(event)
  drag({
    x: x - previous.x,
    y: y - previous.y
  })
  previous = {x, y}
})

document.getElementById('close-dialog').addEventListener('click', () => {
  document.getElementById('dialog').hidden = true
})

class EditableBar extends Bar {
  constructor (...args) {
    super(...args)
    this.element.addEventListener('dblclick', this.dblclick.bind(this))
    this.element.addEventListener('mousemove', this.mousemove.bind(this))
    this.element.addEventListener('mousedown', this.mousedown.bind(this))
  }

  dblclick () {
    this.on = !this.on
  }

  mousemove (event) {
    const {x, y} = translate(event)
    this.element.style.cursor = this.cursor(this.region(x, y))
  }

  mousedown (event) {
    if (event.button !== 0) return
    const {x, y} = translate(event)
    drag = this.resize.bind(this, this.region(x, y))
  }

  resize (region, {x, y}) {
    switch (region) {
      case 'm':
        this.x += x
        this.y += y
        break
      case 'n':
        this.y += y
        this.height -= y
        break
      case 's':
        this.height += y
        break
      case 'e':
        this.width += x
        break
      case 'w':
        this.x += x
        this.width -= x
        break
      case 'nw':
        this.resize('n', {x, y})
        this.resize('w', {x, y})
        break
      case 'ne':
        this.resize('n', {x, y})
        this.resize('e', {x, y})
        break
      case 'sw':
        this.resize('s', {x, y})
        this.resize('w', {x, y})
        break
      case 'se':
        this.resize('s', {x, y})
        this.resize('e', {x, y})
        break
    }
  }

  region (x, y) {
    x -= this.x
    y -= this.y

    if (x <= PADDING) {
      if (y <= PADDING) return 'nw'
      else if (y < this.height - PADDING) return 'w'
      else return 'sw'
    }

    else if (x < this.width - PADDING) {
      if (y <= PADDING) return 'n'
      else if (y < this.height - PADDING) return 'm'
      else return 's'
    }

    else {
      if (y <= PADDING) return 'ne'
      else if (y < this.height - PADDING) return 'e'
      else return 'se'
    }
  }

  cursor (region) {
    switch (region) {
      case 'n':
      case 's':
        return 'ns-resize'
      case 'e':
      case 'w':
        return 'ew-resize'
      case 'nw':
      case 'se':
        return 'nwse-resize'
      case 'ne':
      case 'sw':
        return 'nesw-resize'
      case 'm':
        return 'move'
    }
  }
}

class EditableSpikes extends Spikes {
  constructor (...args) {
    super(...args)
    this.element.style.cursor = 'move'
    this.element.addEventListener('dblclick', this.dblclick.bind(this))
    this.element.addEventListener('mousedown', this.mousedown.bind(this))
    this.element.addEventListener('mousemove', this.mousemove.bind(this))
  }

  get direction () {
    return super.direction
  }

  set direction (value) {
    super.direction = value
    this.rect.setAttribute('fill', `url(#edit-spike-${this.direction})`)
  }

  dblclick () {
    this.on = !this.on
  }

  mousemove (event) {
    const {x, y} = translate(event)
    this.element.style.cursor = this.cursor(this.region(x, y))
  }

  mousedown (event) {
    if (event.button !== 0) return
    const {x, y} = translate(event)
    drag = this.resize.bind(this, this.region(x, y))
  }

  resize (region, {x, y}) {
    switch (region) {
      case 'n':
        this.y += y
        this.height -= y
        break
      case 's':
        this.height += y
        break
      case 'e':
        this.width += x
        break
      case 'w':
        this.x += x
        this.width -= x
        break
      case 'm':
        this.x += x
        this.y += y
        break
    }
  }

  region (x, y) {
    x -= this.x
    y -= this.y

    if (this.isUp || this.isDown) {
      if (x <= PADDING) return 'w'
      else if (x < this.width - PADDING) return 'm'
      else return 'e'
    }

    else {
      if (y <= PADDING) return 'n'
      else if (y < this.height - PADDING) return 'm'
      else return 's'
    }
  }

  cursor (region) {
    switch (region) {
      case 'n':
      case 's':
        return 'ns-resize'
      case 'e':
      case 'w':
        return 'ew-resize'
      case 'm':
        return 'move'
    }
  }
}

class EditableGuy extends Guy {
  constructor (...args) {
    super(...args)
    this.element.style.cursor = 'move'
    this.element.addEventListener('mousedown', this.mousedown.bind(this))
  }

  mousedown (event) {
    if (event.button !== 0) return
    drag = ({x, y}) => {
      this.x += x
      this.y += y
    }
  }
}

class EditableGoal extends Goal {
  constructor (...args) {
    super(...args)
    this.element.style.cursor = 'move'
    this.element.addEventListener('mousedown', this.mousedown.bind(this))
  }

  mousedown (event) {
    if (event.button !== 0) return
    drag = ({x, y}) => {
      this.x += x
      this.y += y
    }
  }
}

class Editor extends Body {
  constructor (levels, game) {
    super(document.getElementById('editor'))
    this.bars = []
    this.spikes = []
    this.levels = levels
    this.game = game
    this.guy = new EditableGuy
    this.append(this.guy)
    this.goal = new EditableGoal
    this.append(this.goal)
    this.level = 0
    document.addEventListener('keydown', this.keydown.bind(this))
  }

  addBar (bar) {
    this.bars.push(bar)
    this.append(bar)
    bar.element.addEventListener('click', ({shiftKey}) => {
      if (!shiftKey) return
      bar.remove()
      this.bars = this.bars.filter((other) => other === bar)
    })
  }

  addSpike (spike) {
    this.spikes.push(spike)
    this.append(spike)
    spike.element.addEventListener('click', ({shiftKey}) => {
      if (!shiftKey) return
      spike.remove()
      this.spikes = this.spikes.filter((other) => other === spike)
    })
  }

  get level () {
    return this._level
  }

  set level (value) {
    this._level = Math.max(0, Math.min(this.levels.length - 1, value))

    const [guy, goal, bars, spikes] = this.levels[this.level]
    this.guy.load(...guy)
    this.goal.load(...goal)
    while (this.bars.length) this.bars.pop().remove()
    for (const args of bars) {
      this.addBar(new EditableBar(...args))
    }
    while (this.spikes.length) this.spikes.pop().remove()
    for (const args of spikes) {
      this.addSpike(new EditableSpikes(...args))
    }
  }

  keydown ({key}) {
    if (this.hidden) return

    switch (key) {
      case 'ArrowRight':
        this.level += 1
        break
      case 'ArrowLeft':
        this.level -= 1
        break
      case 'p':
        this.addBar(new EditableBar(0, 0, 48, 48, true))
        break
      case 'c':
        navigator.clipboard.writeText(JSON.stringify(this))
        break
      case 'u':
      case 'd':
      case 'l':
      case 'r':
        if (!DOWN.has('s')) return
        this.addSpike(key === 'u' || key === 'd'
          ? new EditableSpikes(0, 0, 64, 8, true, key === 'u' ? 'up' : 'down')
          : new EditableSpikes(0, 0, 8, 64, true, key === 'l' ? 'left' : 'right')
        )
        break
      case 'h':
        document.getElementById('dialog').hidden = !document.getElementById('dialog').hidden
        break
      case 'g':
        if (this.game) {
          this.game.scene.levels = [JSON.parse(JSON.stringify(this))]
          this.game.scene.index = 0
          this.game.state = 'play'
        }
        break
      case 'Escape':
        if (this.game) this.game.state = 'title'
        break
    }
  }

  toJSON () {
    return [this.guy, this.goal, this.bars, this.spikes]
  }
}


/* ---- src/levels.js ---- */
const getRandomInt = function(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min)) + min
}

var levels = [
  // https://cl.ly/0e72dd890b93
  [[24,239],[724,244],[[0,288,330,192,1],[438,288,330,192,1]],[]],
  // https://cl.ly/80f69e0e3b74
  [[371,51],[724,404],[[0,100,768,16,1],[0,216,768,16,0],[0,332,768,16,1],[0,448,768,32,0]],[]],
  // https://cl.ly/a751117681a8
  [[24,239],[724,244],[[0,288,330,192,1],[438,288,330,192,0]],[]],
  // https://cl.ly/ffd71d417828
  [[23,263],[724,268],[[0,312,768,8,1],[380,0,8,312,1],[0,408,768,72,0]],[]],
  // https://cl.ly/7ce0a55e6c23
  [[116, 96], [628, 412], [
    [64, 448, 128, 32, false],
    [320, 448, 128, 32, true],
    [576, 448, 128, 32, false]
  ], []],
  // https://cl.ly/e7a2d2ecc0e7
  [[24,399],[604,152],[[0,448,768,32,1],[128,320,512,8,1],[632,328,8,120,1],[128,192,512,8,1],[128,200,8,120,1],[640,384,128,8,0],[0,256,128,8,0]],[]],
  // https://cl.ly/c3c9ccaf76a3
  [[16,275],[566,248],[[0,0,768,64,1],[0,64,128,192,1],[0,324,248,92,1],[0,416,768,64,1],[192,132,180,96,1],[440,64,100,224,1],[620,112,72,245,1],[192,228,56,96,1],[300,288,320,69,1]],[]],
  // https://cl.ly/91292cb165a6
  [[16,367],[704,84],[[0,416,244,64,1],[524,128,244,352,1],[288,320,64,160,0],[416,224,64,256,0]],[]],
  // https://cl.ly/dd353a0a4faf
  [[104,175],[176,32],[[96,224,56,8,1],[96,232,56,8,0],[144,72,8,152,1],[152,72,8,168,0],[160,72,128,92,1],[160,164,256,92,1],[160,256,384,92,1],[544,256,8,92,0],[160,348,512,92,1],[160,440,512,8,0],[552,340,120,8,0]],[]],
  // https://cl.ly/752bc2a6a72f
  [[16,422],[724,416],[[0,472,48,8,1],[0,376,48,8,0],[0,280,48,8,1],[0,184,96,8,0],[384,456,384,24,1]],[]],
  // https://cl.ly/13b3b6c2966d
  [[16,239],[724,244],[[0,288,768,192,1],[336,0,96,288,1]],[]],
  // https://cl.ly/74d75c6b6df7
  [[16, 56], [724, 216],
    [0, 1, 2, 3, 4, 5, 6, 7].map((x) => [x * 96, getRandomInt(240, 300), getRandomInt(24, 72), getRandomInt(24, 180), getRandomInt(0, 2)])
  , []],
  // https://cl.ly/129369ca9d9d
  [[48,383],[696,384],[[48,432,24,24,1],[156,348,24,24,0],[48,264,24,24,1],[156,180,24,24,0],[264,180,24,24,1],[372,180,24,24,0],[480,180,24,24,1],[588,180,24,24,0],[696,264,24,24,1],[588,348,24,24,0],[696,432,24,24,1]],[]],
  // https://cl.ly/de15c9f04a7d
  [[24, 8], [724, getRandomInt(128, 416)],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((x) => [x * 32, getRandomInt(64, 464), 8, 8, getRandomInt(0, 2)])
  , []],
  // https://cl.ly/aef7878e8263
  [[372,391],[372,20],[[320,440,128,8,1],[320,344,128,8,0],[320,248,128,8,1],[320,152,128,8,0]],[[320,448,128,8,1,"down"],[320,352,128,8,0,"down"],[320,256,128,8,1,"down"],[320,160,128,8,0,"down"]]],
  // https://cl.ly/bfc474be92d1
  [[372,15],[372,418],[[320,64,128,16,1],[256,80,256,128,0],[320,208,128,16,1],[348,224,72,160,1],[348,384,8,96,1],[356,384,8,96,0],[412,384,8,96,1],[404,384,8,96,0]],[[312,64,8,16,1,"left"],[448,64,8,16,1,"right"],[312,208,8,16,1,"left"],[448,208,8,16,1,"right"]]],
  // https://cl.ly/38831ab3bb46
  [[24, 64], [724, getRandomInt(128, 416)], [[0, getRandomInt(128, 352), 768, 2, true]],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((x) =>
      [x * 48, getRandomInt(128, 352), 16, 8, getRandomInt(0, 2), 'up']
    )
  ],
  [[371, 20], [372, 372], [
    [336, 320, 96, 8, true],
    [336, 416, 96, 8, true],
    [336, 328, 8, 88, true],
    [424, 328, 8, 88, true],
  ], [
    [336, 312, 96, 8, true, 'up']
  ]],
  // https://cl.ly/bb5826e004eb
  [[371, 20], [584, 404], [
    [0, 152, 368, 8, true],
    [0, 248, 448, 8, true],
    [0, 344, 528, 8, true],
  ], [
    [0, 144, 368, 8, true, 'up'],
    [0, 240, 448, 8, true, 'up'],
    [0, 336, 528, 8, true, 'up'],
  ]],
  // https://cl.ly/130ada902b79
  [[12, 312], [725, 307], [
    [0, 152, 768, 72, true],
    [0, 362, 64, 8, true],
    [192, 362, 128, 8, true],
    [448, 362, 128, 8, true],
    [704, 362, 64, 8, true]
  ], [
    [0, 224, 768, 8, true, 'down'],
  ]],
  // https://cl.ly/be19660c5789
  [[371, 20], [372, 404], [
    [320, 384, 128, 8, true],
    [320, 272, 128, 8, false],
    [320, 168, 128, 8, true],
  ], [
    [320, 376, 128, 8, true, 'up'],
    [320, 264, 128, 8, false, 'up'],
    [320, 160, 128, 8, true, 'up'],
  ]],
  // https://cl.ly/52c9d3f5f7e6
  [[63,263],[660,272],[[48,312,96,96,1],[144,124,48,284,1],[192,124,96,96,1],[192,312,96,96,0],[288,124,48,284,1],[336,312,96,96,1],[432,124,48,284,1],[480,124,96,96,1],[480,312,96,96,0],[576,124,48,284,1],[624,312,96,96,1]],[[232,304,16,8,0,"up"],[520,304,16,8,0,"up"]]],
  // https://cl.ly/f83f4b0bb02d
  [[148, 254], [600, 266], [
    [94, 176, 8, 128, true],
    [222, 176, 8, 128, true],
    [94, 168, 136, 8, true],
    [94, 304, 136, 8, true],
    [318, 176, 8, 128, true],
    [446, 176, 8, 128, true],
    [318, 168, 136, 8, true],
    [318, 304, 136, 8, true],
    [542, 176, 8, 128, true],
    [670, 176, 8, 128, true],
    [542, 168, 136, 8, true],
    [542, 304, 136, 8, true]
  ], []],
  // https://cl.ly/0d180032f589
  [[400, 20], [372, 432], [], [
    [0, 96, 384, 8, true, 'up'],
    [0, 104, 384, 8, false, 'down'],
    [400, 240, 368, 8, true, 'up'],
    [400, 248, 368, 8, false, 'down'],
    [0, 384, 384, 8, true, 'up'],
    [0, 392, 384, 8, false, 'down'],
  ]],
  // https://cl.ly/d11a48fe9b24
[[368,14],[269,419],[],[[328,32,8,80,1,"right"],[320,32,8,80,0,"left"],[424,32,8,80,1,"left"],[432,32,8,80,0,"right"],[280,175,8,80,1,"right"],[272,174,8,80,0,"left"],[376,175,8,80,1,"left"],[384,175,8,80,0,"right"],[232,320,8,80,1,"right"],[224,319,8,80,0,"left"],[328,320,8,80,1,"left"],[336,319,8,80,0,"right"]]]
]


/* ---- index.js ---- */















class Scene extends Body {
  constructor (game, levels) {
    super(document.getElementById('game'))
    this.deaths = new Counter(document.getElementById('death-counter'))
    this.stars = new Counter(document.getElementById('level-counter'))
    this.congrats = new Body(document.getElementById('congrats'))
    this.esc = new Body(document.getElementById('esc'))
    this.game = game
    this.levels = levels
    this.bars = []
    this.spikes = []
    this.paused = false
    this.guy = new Guy
    this.append(this.guy)
    this.goal = new Goal
    this.append(this.goal)
    this.index = 0
  }

  get fromURL () {
    return !!this._fromURL
  }

  set fromURL (value) {
    this._fromURL = !!value
    this.esc.hidden = !this.fromURL
  }

  keydown ({key}) {
    switch (key) {
      case 'Enter':
        if (this.finished) {
          this.fromURL = false
          this.levels = levels
          this.game.state = 'title'
          playMusic()
        }
        break
      case 'Escape':
        if (this.fromURL) {
          this.fromURL = false
          this.levels = levels
          this.game.state = 'title'
          playMusic()
        }
        break
    }
  }

  get on () {
    return this._on
  }

  set on (value) {
    this._on = value
    document.body.classList.toggle('on', value)
    document.body.classList.toggle('off', !value)
  }

  get index () {
    return this._index
  }

  set index (value) {
    this._index = Math.min(this.levels.length, Math.max(value || 0))

    this.on = true
    this.stars.value = this.index
    while (this.bars.length) this.bars.pop().remove()
    while (this.spikes.length) this.spikes.pop().remove()

    if (this.finished) {
      this.guy.hidden = true
      this.congrats.hidden = false
      playWin()
      return
    }

    const [guy, goal, bars, spikes] = this.level
    this.guy.load(...guy)
    this.guy.hidden = false
    this.goal.load(...goal)
    this.goal.hidden = false
    this.congrats.hidden = true

    for (const values of bars) {
      const bar = new Bar(...values)
      this.append(bar)
      this.bars.push(bar)
    }

    for (const values of spikes) {
      const spike = new Spikes(...values)
      this.append(spike)
      this.spikes.push(spike)
    }
  }

  get level () {
    return this.levels[this.index]
  }

  get finished () {
    return this.index >= this.levels.length
  }

  async advance () {
    GOAL_FX.play()
    this.paused = true
    document.body.classList.add('finish')
    await sleep(1000)
    this.index += 1
    document.body.classList.remove('finish')
    await sleep(1000)
    if (this.finished) {
      this.goal.hidden = true
    } else {
      this.paused = false
    }
  }

  async death () {
    DEATH_FX.play()
    this.deaths.value += 1
    this.paused = true
    const death = document.getElementById('death')
    death.setAttribute('x', this.guy.x - 32 + this.guy.width / 2)
    death.setAttribute('y', this.guy.y - 32 + this.guy.height / 2)
    this.guy.element.setAttribute('hidden', true)
    document.body.classList.add('dying')
    await sleep(700)
    document.body.classList.remove('dying')
    this.reset()
    this.guy.element.removeAttribute('hidden')
    this.paused = false
  }

  reset () {
    this.guy.load(...this.level[0])
  }

  lost () {
    return this.guy.bottom > HEIGHT || this.bars.some((bar) =>
      bar.on === this.on && bar.overlaps(this.guy)
    ) || this.spikes.some((spike) =>
      spike.on === this.on && spike.overlaps(this.guy)
    )
  }

  setBounds (body) {
    const {bounds} = body

    bounds.left = -body.left
    bounds.right = WIDTH - body.right
    bounds.top = -body.top
    bounds.bottom = HEIGHT - body.bottom + 1

    for (const bar of this.bars) {
      if (bar.on !== this.on) continue

      if (bar.top < body.bottom && bar.bottom > body.top) {
        if (bar.isRightOf(body)) {
          bounds.right = Math.min(bounds.right, bar.left - body.right)
        } else if (bar.isLeftOf(body)) {
          bounds.left = Math.max(bounds.left, bar.right - body.left)
        }
      }

      if (bar.left < body.right && bar.right > body.left) {
        if (bar.isBelow(body)) {
          bounds.bottom = Math.min(bounds.bottom, bar.top - body.bottom)
        } else if (bar.isAbove(body)) {
          bounds.top = Math.max(bounds.top, bar.bottom - body.top)
        }
      }
    }

    return bounds
  }

  tick (scale) {
    if (this.paused || this.hidden) return

    this.guy.tick(scale)

    const {left, right} = this.setBounds(this.guy)
    this.guy.x += Math.min(right, Math.max(left, this.guy.vx))

    const {top, bottom} = this.setBounds(this.guy)
    this.guy.y += Math.min(bottom, Math.max(top, this.guy.vy))

    if (bottom === 0) {
      this.guy.vy = upKey() ? -scale(1200) : 0
      if (upKey()) JUMP_FX.play()
    } else {
      this.guy.vy = Math.min(scale(600), this.guy.vy + scale(120))
    }

    if (this.lost()) {
      this.death()
    } else if (this.guy.overlaps(this.goal)) {
      this.advance()
    }
  }
}

class Game {
  constructor () {
    this.title = new Title(this)
    this.controls = new Controls(this)
    this.scene = new Scene(this, levels)
    this.editor = new Editor(
      [[[100, 300], [500, 300], [[84,361,362,48,1]], [[446,401,176,8,1,"up"]]]],
      this
    )
    this.dialog = document.getElementById('dialog')
    onPress(1, this.toggle.bind(this))
    document.addEventListener('keydown', this.keydown.bind(this))
  }

  toggle () {
    this.scene.on = !this.scene.on
    if (this.scene.on) OFF_FX.play()
    else ON_FX.play()
  }

  keydown (event) {
    if (event.key === ' ') this.toggle()
    if (!this.scene.hidden) this.scene.keydown(event)
    else if (!this.controls.hidden) this.controls.keydown(event)
    else if (!this.title.hidden) this.title.keydown(event)
  }

  get state () {
    return this._state
  }

  set state (value) {
    this._state = value

    this.scene.hidden = this.state !== 'play'
    this.title.hidden = this.state !== 'title'
    this.controls.hidden = this.state !== 'controls'
    this.editor.hidden = this.state !== 'edit'
    this.dialog.hidden = this.state !== 'edit'
  }

  tick (scale) {
    this.scene.tick(scale)
    this.controls.tick(scale)
  }
}

const game = new Game



let previousTick = 0
requestAnimationFrame(function tick (time) {
  // To deal with different frame rates, we define per-second speeds and adjust
  // them according to the time since the last frame was rendered.
  const duration = time - previousTick
  game.tick((value) => Math.round(value * duration / 1000))
  previousTick = time
  requestAnimationFrame(tick)
})


window.ONOFF_DOWN = DOWN;
window.ONOFF_PRESSED = PRESSED;
window.ONOFF_upKey = upKey;
if (typeof game !== "undefined") window.ONOFF_GAME = game;
})();
