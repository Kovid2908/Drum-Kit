"use strict";

/* =========================================================
   DRUM KIT  -  index.js

   1. Drums and audio      (sounds, synthesized sounds, playDrum)
   2. Pads and keyboard    (clicks, key presses, button animation)
   3. Clock                (one shared beat counter: tempo, metronome)
   4. Song Mode            (patterns, scheduling, rhythm grid)
   5. Recording            (record / play / clear)
   6. Controls and start-up
   ========================================================= */


/* =========================================================
   1. DRUMS AND AUDIO
   ========================================================= */

// Every drum in one place. A drum either has an MP3 "file" or a "synth"
// function (a sound built with the Web Audio API).
// "level" is an optional volume trim if one sound feels too loud or quiet.
const DRUMS = {
  l: { name: "Kick",       file: "sounds/kick-bass.mp3" },
  j: { name: "Snare",      file: "sounds/snare.mp3" },
  k: { name: "Crash",      file: "sounds/crash.mp3" },
  w: { name: "Tom 1",      file: "sounds/tom-1.mp3" },
  a: { name: "Tom 2",      file: "sounds/tom-2.mp3" },
  s: { name: "Tom 3",      file: "sounds/tom-3.mp3" },
  d: { name: "Tom 4",      file: "sounds/tom-4.mp3" },
  q: { name: "Hi-Hat",     synth: closedHat },
  e: { name: "Open Hat",   synth: openHat },
  x: { name: "Ride",       synth: ride },
  z: { name: "Clap",       synth: clap },
  c: { name: "Perc",       synth: perc }
};

// Load each MP3 into a small pool of Audio objects. Using a pool means
// the same drum can be hit quickly (a roll) without cutting itself off.
Object.values(DRUMS).forEach(drum => {
  if (!drum.file) return;
  drum.pool = Array.from({ length: 4 }, () => {
    const audio = new Audio(drum.file);
    audio.preload = "auto";
    return audio;
  });
  drum.next = 0;
});

let volume = 0.8;                       // 0 to 1, set by the volume slider
const level = () => volume * volume;    // squared so the slider feels natural

let audioCtx = null;
let masterGain = null;
let noiseBuffer = null;

// The browser only allows audio after a click or key press, so the
// AudioContext is created the first time we need it.
function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = level();

    // a compressor on the output stops loud hits from clipping
    const limiter = audioCtx.createDynamicsCompressor();
    masterGain.connect(limiter);
    limiter.connect(audioCtx.destination);

    // one second of white noise, created once and reused by hats, clap, ride
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}


// ----- small helpers used by the synthesized sounds -----

// A volume envelope: starts at "peak" and fades out over "decay" seconds.
function envelope(t, peak, decay) {
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
  return gain;
}

function makeFilter(type, frequency, q = 1) {
  const filter = audioCtx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

// A short piece of the shared noise buffer, starting at a random spot
// so two hits never sound exactly the same.
function noise(t, duration) {
  const source = audioCtx.createBufferSource();
  source.buffer = noiseBuffer;
  source.start(t, Math.random() * Math.max(0, 1 - duration), duration);
  return source;
}

function tone(type, frequency, t, duration) {
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.start(t);
  osc.stop(t + duration);
  return osc;
}


// ----- the synthesized drums. Each gets (start time, velocity 0-1) -----

// Hi-hats are high-passed white noise. Closed = very short, open = longer.
// The "choke" gain lets a closed hit cut off a ringing open hat, like a real pedal.
function hat(t, velocity, decay) {
  const choke = audioCtx.createGain();
  choke.connect(masterGain);

  const source = noise(t, decay + 0.05);
  const highpass = makeFilter("highpass", 7000);
  const env = envelope(t, 0.4 * velocity, decay);

  source.connect(highpass);
  highpass.connect(env);
  env.connect(choke);
  return choke;
}

let openHatChoke = null;

function chokeOpenHat(t) {
  if (openHatChoke) {
    openHatChoke.gain.setTargetAtTime(0, t, 0.01);
    openHatChoke = null;
  }
}

function closedHat(t, velocity) {
  chokeOpenHat(t);
  hat(t, velocity, 0.05);
}

function openHat(t, velocity) {
  chokeOpenHat(t);
  openHatChoke = hat(t, velocity, 0.4);
}

// Ride: a quiet noise shimmer plus a few sine "pings" for the bell sound.
function ride(t, velocity) {
  const shimmer = noise(t, 1);
  const highpass = makeFilter("highpass", 6000);
  const env = envelope(t, 0.18 * velocity, 0.9);
  shimmer.connect(highpass);
  highpass.connect(env);
  env.connect(masterGain);

  [2400, 3400, 4700, 6100].forEach((frequency, i) => {
    const ping = tone("sine", frequency, t, 0.8);
    const pingEnv = envelope(t, 0.07 * velocity, 0.7 - i * 0.12);
    ping.connect(pingEnv);
    pingEnv.connect(masterGain);
  });
}

// Clap: three quick noise bursts, then a longer tail, all band-passed.
function noiseBurst(t, decay, peak) {
  const source = noise(t, decay + 0.02);
  const band = makeFilter("bandpass", 1400, 1.2);
  const env = envelope(t, peak, decay);
  source.connect(band);
  band.connect(env);
  env.connect(masterGain);
}

function clap(t, velocity) {
  [0, 0.012, 0.024].forEach(offset => noiseBurst(t + offset, 0.02, 1.2 * velocity));
  noiseBurst(t + 0.036, 0.18, velocity);
}

// Perc: a cowbell-style sound, two square waves through a band-pass filter.
function perc(t, velocity) {
  const band = makeFilter("bandpass", 800, 0.8);
  const env = envelope(t, 0.45 * velocity, 0.3);
  [540, 800].forEach(frequency => tone("square", frequency, t, 0.35).connect(band));
  band.connect(env);
  env.connect(masterGain);
}

// Metronome tick: a short sine blip, higher on beat 1.
function click(accent) {
  const t = audioCtx.currentTime;
  const env = envelope(t, accent ? 0.5 : 0.3, 0.05);
  tone("sine", accent ? 1500 : 1000, t, 0.06).connect(env);
  env.connect(masterGain);
}


// ----- the one function everything uses to make a drum sound -----

function playDrum(key, velocity = 1) {
  const drum = DRUMS[key];
  if (!drum) return;

  if (drum.pool) {
    // MP3 drum: take the next Audio object from the pool and restart it
    const audio = drum.pool[drum.next];
    drum.next = (drum.next + 1) % drum.pool.length;
    audio.currentTime = 0;
    audio.volume = Math.min(1, level() * velocity);
    audio.play().catch(() => {});
  } else {
    // synthesized drum
    getAudio();
    drum.synth(audioCtx.currentTime, velocity * (drum.level || 1));
  }

  flashPad(key);
}


/* =========================================================
   2. PADS AND KEYBOARD
   ========================================================= */

const pads = {};          // key letter -> its button element
const padTimers = {};

document.querySelectorAll(".pad").forEach(pad => {
  const key = pad.dataset.key;
  pads[key] = pad;

  // pointerdown reacts faster than click and works for multi-touch
  pad.addEventListener("pointerdown", event => {
    event.preventDefault();
    userHit(key);
  });

  // a click with detail 0 means the pad was "clicked" with Enter/Space
  pad.addEventListener("click", event => {
    if (event.detail === 0) userHit(key);
  });
});

document.addEventListener("keydown", event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.tagName === "SELECT") return;

  const key = event.key.toLowerCase();
  if (DRUMS[key]) userHit(key);
});

// The pressed look. Used for the player's hits AND for songs / recordings.
function flashPad(key) {
  const pad = pads[key];
  if (!pad) return;

  pad.classList.add("hit");
  clearTimeout(padTimers[key]);
  padTimers[key] = setTimeout(() => pad.classList.remove("hit"), 110);
}

// A hit made by the person playing. Only these are saved when recording
// (song and playback hits go through playDrum directly).
function userHit(key) {
  playDrum(key);

  if (recorder.state === "recording") {
    recorder.hits.push({ key, time: performance.now() - recorder.startedAt });
  }
}


/* =========================================================
   3. CLOCK
   One shared beat counter drives the song player, the metronome
   and the beat lights, so they always stay in sync.

   Everything is measured in BEATS, not milliseconds. The tempo only
   decides how long one beat lasts (60000 / bpm ms), so changing the
   tempo while a song plays never breaks the rhythm.
   ========================================================= */

let bpm = 120;
let clockRunning = false;
let clockStart = 0;        // performance.now() at beat 0
let frozenBeat = 0;        // where we were when the clock was paused
let timerId = null;
let nextClickBeat = 0;     // next whole beat to flash / click
let metronomeOn = false;

const msPerBeat = () => 60000 / bpm;

function currentBeat() {
  return clockRunning
    ? (performance.now() - clockStart) / msPerBeat()
    : frozenBeat;
}

function startClock(fromBeat = 0) {
  getAudio();
  clockStart = performance.now() - fromBeat * msPerBeat();
  clockRunning = true;
  nextClickBeat = Math.ceil(fromBeat - 1e-6);
  schedule();
}

function stopClock(keepPosition) {
  frozenBeat = keepPosition ? currentBeat() : 0;   // read before stopping
  clockRunning = false;
  clearTimeout(timerId);
  if (!keepPosition) beatDots.forEach(dot => dot.classList.remove("on"));
}

// Change tempo without losing our place in the song.
function setBpm(value) {
  const beat = currentBeat();
  bpm = value;
  if (clockRunning) {
    clockStart = performance.now() - beat * msPerBeat();
    schedule();
  }
  tempoSlider.value = bpm;
  tempoValue.textContent = bpm + " BPM";
}

// Set ONE timer for whichever is next: a beat tick or a song note.
// Using setTimeout for each event (instead of polling) keeps timing tight.
function schedule() {
  clearTimeout(timerId);
  if (!clockRunning) return;

  let nextBeat = nextClickBeat;
  if (songState === "playing") nextBeat = Math.min(nextBeat, songNextBeat());

  const delay = Math.max(0, (nextBeat - currentBeat()) * msPerBeat());
  timerId = setTimeout(tick, delay);
}

// Runs at each scheduled moment: does everything that is due, then sets the next timer.
function tick() {
  const now = currentBeat() + 0.005;      // tiny tolerance for timer jitter

  // if the tab was in the background we may be far behind: skip old clicks
  if (now - nextClickBeat > 1) nextClickBeat = Math.ceil(now);

  while (nextClickBeat <= now) {
    onBeat(nextClickBeat);
    nextClickBeat++;
  }

  if (songState === "playing") playDueNotes(now);
  if (clockRunning) schedule();
}

// Beat counter lights (1 2 3 4) and the metronome click.
function onBeat(beat) {
  const position = beat % 4;
  beatDots.forEach((dot, i) => dot.classList.toggle("on", i === position));
  if (metronomeOn) click(position === 0);
}


/* =========================================================
   4. SONG MODE
   ========================================================= */

// Each song is written as a step grid, one string per drum (the key is the
// drum's key letter). A string is read left to right in 16th notes, so
// 4 characters = 1 beat and 16 characters = 1 bar:
//     X = accented hit    x = normal hit    g = ghost (soft) hit    . = rest
// Spaces and | are ignored, they only make it easier to read.
// If a string is shorter than the song it simply repeats.
const SONGS = [
  {
    name: "We Will Rock You", artist: "Queen", bpm: 81, bars: 2,
    feel: "stomp, stomp, clap",
    lanes: {
      l: "X.x. .... X.x. ....",
      z: ".... X... .... X..."
    }
  },
  {
    name: "Seven Nation Army", artist: "The White Stripes", bpm: 124, bars: 2,
    feel: "riff-style kick, backbeat snare",
    lanes: {
      l: "X... ..x. x... .... | X... ..x. x... ..x.",
      j: ".... X... .... X...",
      q: "x.x. x.x. x.x. x.x.",
      k: "X... .... .... .... | .... .... .... ...."
    }
  },
  {
    name: "Another One Bites the Dust", artist: "Queen", bpm: 110, bars: 2,
    feel: "tight funk with ghost-note hats",
    lanes: {
      l: "X... .... x... ..x. | X... ..x. x... ..x.",
      j: ".... X... .... X...",
      q: "xgxg xgxg xgxg xgxg"
    }
  },
  {
    name: "Billie Jean", artist: "Michael Jackson", bpm: 117, bars: 2,
    feel: "kick on 1 and 3, snare + clap on 2 and 4",
    lanes: {
      l: "X... .... x... ....",
      j: ".... X... .... X...",
      z: ".... x... .... x...",
      q: "x.x. x.x. x.x. x...",
      e: ".... .... .... ..x."
    }
  },
  {
    name: "Smells Like Teen Spirit", artist: "Nirvana", bpm: 117, bars: 2,
    feel: "rock groove, open hats, tom fill",
    lanes: {
      l: "X... .... x.x. .... | X... .... x.x. ....",
      j: ".... X... .... X... | .... X... .... ....",
      e: "x.x. x.x. x.x. x.x. | x.x. x.x. x.x. ....",
      k: "X... .... .... .... | .... .... .... ....",
      w: ".... .... .... .... | .... .... .... X...",
      a: ".... .... .... .... | .... .... .... .x..",
      s: ".... .... .... .... | .... .... .... ..x.",
      d: ".... .... .... .... | .... .... .... ...x"
    }
  },
  {
    name: "Stayin' Alive", artist: "Bee Gees", bpm: 104, bars: 2,
    feel: "disco: four on the floor, open hats on the off-beats",
    lanes: {
      l: "X... x... x... x...",
      j: ".... X... .... X...",
      z: ".... x... .... x...",
      q: "x... x... x... x...",
      e: "..x. ..x. ..x. ..x."
    }
  },
  {
    name: "Despacito", artist: "Luis Fonsi", bpm: 89, bars: 2,
    feel: "dembow: steady kick, syncopated snare",
    lanes: {
      l: "X... x... X... x...",
      j: "...x ..x. ...x ..x.",
      q: "x.x. x.x. x.x. x.x.",
      c: "..x. .... ..x. ...."
    }
  },
  {
    name: "Blinding Lights", artist: "The Weeknd", bpm: 171, bars: 2,
    feel: "fast 80s drum machine",
    lanes: {
      l: "X... ..x. X... ..x.",
      j: ".... X... .... X...",
      z: ".... x... .... x...",
      q: "x.x. x.x. x.x. x.xg",
      k: "X... .... .... .... | .... .... .... ...."
    }
  },
  {
    name: "Uptown Funk", artist: "Bruno Mars", bpm: 115, bars: 2,
    feel: "funk: syncopated kick, ghost-note snare",
    lanes: {
      l: "X... ..x. ..x. .... | X... ..x. ..x. ..x.",
      j: ".... X..g .... X.g.",
      z: ".... x... .... x...",
      q: "x.xx x.xx x.xx x.xx",
      c: ".... .... ..x. .... | .... .... ..x. ...x"
    }
  },
  {
    name: "Wipe Out", artist: "The Surfaris", bpm: 140, bars: 2,
    feel: "tom roll, then a surf beat",
    lanes: {
      w: "Xxxx .... .... .... | .... .... .... ....",
      a: ".... Xxxx .... .... | .... .... .... ....",
      s: ".... .... Xxxx .... | .... .... .... ....",
      d: ".... .... .... Xxxx | .... .... .... ....",
      l: ".... .... .... .... | X... .... x... ....",
      j: ".... .... .... .... | .... X... .... X...",
      k: ".... .... .... .... | X... .... .... ....",
      q: ".... .... .... .... | x.x. x.x. x.x. x.x."
    }
  }
];

const VELOCITY = { X: 1, x: 0.7, g: 0.35 };
const STEPS_PER_BEAT = 4;                       // 16th notes
const BEATS_PER_BAR = 4;
const LANE_ORDER = ["l", "j", "z", "q", "e", "x", "k", "c", "w", "a", "s", "d"];

// Turn the step grid into a list of notes with beat positions:
//   { key: "l", beat: 0.5, step: 2, velocity: 0.7 }
// "beat" is where the note falls (0.5 = the "and" of beat 1), so a song
// can have any mix of note lengths and rests.
function buildNotes(song) {
  const totalSteps = song.bars * BEATS_PER_BAR * STEPS_PER_BEAT;
  const notes = [];

  Object.keys(song.lanes).forEach(key => {
    const lane = song.lanes[key].replace(/[\s|]/g, "");
    if (totalSteps % lane.length !== 0) {
      console.warn(`${song.name}: lane "${key}" has ${lane.length} steps, expected 16 or ${totalSteps}`);
    }
    for (let step = 0; step < totalSteps; step++) {
      const velocity = VELOCITY[lane[step % lane.length]];
      if (velocity) {
        notes.push({ key, beat: step / STEPS_PER_BEAT, step, velocity });
      }
    }
  });

  notes.sort((a, b) => a.beat - b.beat);
  song.notes = notes;
  song.beats = song.bars * BEATS_PER_BAR;
}

SONGS.forEach(buildNotes);


// ----- song player state -----

let currentSong = SONGS[0];
let songState = "stopped";     // "stopped" | "playing" | "paused"
let songIndex = 0;             // which note plays next
let songLoop = 0;              // how many times the pattern has repeated

// Beat position of the next note (or of the end of the pattern).
function songNextBeat() {
  if (songIndex >= currentSong.notes.length) {
    return (songLoop + 1) * currentSong.beats;
  }
  return songLoop * currentSong.beats + currentSong.notes[songIndex].beat;
}

// Play every note whose time has come.
function playDueNotes(now) {
  while (true) {
    if (songIndex >= currentSong.notes.length) {
      if (!loopBox.checked) {
        // no looping: stop once the end of the pattern is reached
        if (now >= (songLoop + 1) * currentSong.beats) stopSong();
        return;
      }
      songIndex = 0;       // loop: go back to the first note
      songLoop++;
    }

    const note = currentSong.notes[songIndex];
    if (songLoop * currentSong.beats + note.beat > now) return;

    playDrum(note.key, note.velocity);
    songIndex++;
  }
}

function playSong() {
  songState = "playing";
  songIndex = 0;
  songLoop = 0;
  clearHighlight();
  startClock(0);
  startAnimation();
  updateSongUI();
}

function pauseResumeSong() {
  if (songState === "playing") {
    songState = "paused";
    stopClock(true);                 // remember where we are
  } else if (songState === "paused") {
    songState = "playing";
    startClock(frozenBeat);          // carry on from the same beat
    startAnimation();
  }
  updateSongUI();
}

function stopSong() {
  songState = "stopped";
  if (metronomeOn) {
    if (clockRunning) schedule(); else startClock(0);   // metronome keeps going
  } else {
    stopClock(false);
  }
  clearHighlight();
  songPosition.textContent = "";
  updateSongUI();
}

function selectSong(index) {
  stopSong();
  currentSong = SONGS[index];
  setBpm(currentSong.bpm);
  renderSequence();
  songTitle.textContent = currentSong.name;
  songMeta.textContent = `${currentSong.artist} · ${currentSong.bpm} BPM · ${currentSong.feel}`;
}


// ----- rhythm grid (shows the pattern and the moving playhead) -----

let stepColumns = [];      // stepColumns[step] = all cells in that column
let lastStep = -1;
let rafId = null;

function renderSequence() {
  const totalSteps = currentSong.beats * STEPS_PER_BEAT;
  const velocityAt = {};
  currentSong.notes.forEach(note => { velocityAt[note.key + note.step] = note.velocity; });

  stepColumns = Array.from({ length: totalSteps }, () => []);
  lastStep = -1;
  sequenceEl.innerHTML = "";

  // builds one row; "fill" decides what goes in each cell
  function addLane(label, fill) {
    const lane = document.createElement("div");
    lane.className = "lane";

    const name = document.createElement("span");
    name.className = "lane-name";
    name.textContent = label;

    const cells = document.createElement("div");
    cells.className = "cells";

    for (let step = 0; step < totalSteps; step++) {
      const cell = document.createElement("span");
      cell.className = "cell";
      if (step > 0 && step % (BEATS_PER_BAR * STEPS_PER_BEAT) === 0) cell.classList.add("bar-start");
      else if (step > 0 && step % STEPS_PER_BEAT === 0) cell.classList.add("beat-start");
      fill(cell, step);
      stepColumns[step].push(cell);
      cells.appendChild(cell);
    }

    lane.append(name, cells);
    sequenceEl.appendChild(lane);
  }

  // top row: beat numbers 1 2 3 4
  addLane("", (cell, step) => {
    cell.classList.add("ruler");
    if (step % STEPS_PER_BEAT === 0) cell.textContent = (step / STEPS_PER_BEAT) % BEATS_PER_BAR + 1;
  });

  // one row for each drum used in this song
  LANE_ORDER.filter(key => currentSong.lanes[key]).forEach(key => {
    addLane(DRUMS[key].name, (cell, step) => {
      const velocity = velocityAt[key + step];
      if (!velocity) return;
      cell.classList.add("on", velocity === 1 ? "accent" : velocity < 0.5 ? "ghost" : "normal");
      cell.textContent = key.toUpperCase();
    });
  });
}

function highlightStep(step) {
  if (lastStep >= 0) stepColumns[lastStep].forEach(cell => cell.classList.remove("now"));
  if (step >= 0) stepColumns[step].forEach(cell => cell.classList.add("now"));
  lastStep = step;
}

function clearHighlight() {
  highlightStep(-1);
}

// Moves the highlight and updates "Bar 1 · Beat 3" while the song plays.
function animate() {
  if (songState !== "playing") return;

  const beat = currentBeat();
  const step = Math.floor((beat % currentSong.beats) * STEPS_PER_BEAT);
  if (step !== lastStep) highlightStep(step);

  const bar = Math.floor(beat / BEATS_PER_BAR) % currentSong.bars + 1;
  songPosition.textContent = `Bar ${bar} · Beat ${Math.floor(beat % BEATS_PER_BAR) + 1}`;

  rafId = requestAnimationFrame(animate);
}

function startAnimation() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(animate);
}

function updateSongUI() {
  const labels = { stopped: "Stopped", playing: "Playing", paused: "Paused" };
  songStatus.textContent = labels[songState];
  songStatus.dataset.state = songState;

  pauseBtn.textContent = songState === "paused" ? "Resume" : "Pause";
  pauseBtn.disabled = songState === "stopped";
  stopBtn.disabled = songState === "stopped";
}


/* =========================================================
   5. RECORDING
   Hits are saved with their time in milliseconds since pressing
   Record, so playback keeps the original timing.
   ========================================================= */

const recorder = {
  state: "idle",        // "idle" | "recording" | "playing"
  hits: [],             // [{ key, time }]
  startedAt: 0,
  timers: []
};

function startRecording() {
  stopRecordingPlayback();
  recorder.hits = [];
  recorder.state = "recording";
  recorder.startedAt = performance.now();
  updateRecordUI();
}

function stopRecording() {
  recorder.state = "idle";

  // cut the silence before the first hit so playback starts right away
  if (recorder.hits.length) {
    const offset = recorder.hits[0].time;
    recorder.hits.forEach(hit => { hit.time -= offset; });
  }
  updateRecordUI();
}

function playRecording() {
  if (!recorder.hits.length) return;

  recorder.state = "playing";
  recorder.timers = recorder.hits.map(hit => setTimeout(() => playDrum(hit.key), hit.time));

  // one more timer to switch the status back when the last hit is done
  const lastHit = recorder.hits[recorder.hits.length - 1].time;
  recorder.timers.push(setTimeout(stopRecordingPlayback, lastHit + 400));
  updateRecordUI();
}

function stopRecordingPlayback() {
  recorder.timers.forEach(clearTimeout);
  recorder.timers = [];
  if (recorder.state === "playing") {
    recorder.state = "idle";
    updateRecordUI();
  }
}

function clearRecording() {
  stopRecordingPlayback();
  recorder.hits = [];
  recorder.state = "idle";
  updateRecordUI();
}

function updateRecordUI() {
  const count = recorder.hits.length;
  const state = recorder.state;

  if (state === "recording") {
    recStatus.textContent = "Recording...";
    recStatus.dataset.state = "recording";
  } else if (state === "playing") {
    recStatus.textContent = "Playing...";
    recStatus.dataset.state = "playing";
  } else if (count) {
    recStatus.textContent = `Recorded ${count} ${count === 1 ? "hit" : "hits"}`;
    recStatus.dataset.state = "recorded";
  } else {
    recStatus.textContent = "Ready";
    recStatus.dataset.state = "ready";
  }

  recordBtn.textContent = state === "recording" ? "Stop" : "Record";
  recordBtn.classList.toggle("is-recording", state === "recording");
  recPlayBtn.textContent = state === "playing" ? "Stop" : "Play";
  recPlayBtn.disabled = state === "recording" || count === 0;
  recClearBtn.disabled = count === 0 && state !== "recording";
}


/* =========================================================
   6. CONTROLS AND START-UP
   ========================================================= */

const $ = id => document.getElementById(id);

const volumeSlider = $("volume");
const volumeValue = $("volumeValue");
const tempoSlider = $("tempo");
const tempoValue = $("tempoValue");
const metroBtn = $("metroBtn");
const beatDots = document.querySelectorAll(".beat-dot");

const songSelect = $("songSelect");
const songStatus = $("songStatus");
const songTitle = $("songTitle");
const songMeta = $("songMeta");
const songPosition = $("songPosition");
const sequenceEl = $("sequence");
const playBtn = $("playBtn");
const pauseBtn = $("pauseBtn");
const stopBtn = $("stopBtn");
const loopBox = $("loopBox");

const recordBtn = $("recordBtn");
const recPlayBtn = $("recPlayBtn");
const recClearBtn = $("recClearBtn");
const recStatus = $("recStatus");

// volume
volumeSlider.addEventListener("input", () => {
  volume = Number(volumeSlider.value) / 100;
  volumeValue.textContent = volumeSlider.value;
  if (masterGain) masterGain.gain.value = level();
});

// tempo
tempoSlider.addEventListener("input", () => setBpm(Number(tempoSlider.value)));

// metronome
metroBtn.addEventListener("click", () => {
  metronomeOn = !metronomeOn;
  metroBtn.textContent = "Metronome: " + (metronomeOn ? "On" : "Off");
  metroBtn.setAttribute("aria-pressed", metronomeOn);

  if (metronomeOn && !clockRunning && songState !== "paused") startClock(0);
  if (!metronomeOn && songState === "stopped") stopClock(false);
});

// song mode
SONGS.forEach((song, i) => songSelect.add(new Option(`${song.name} - ${song.artist}`, i)));
songSelect.addEventListener("change", () => selectSong(Number(songSelect.value)));
playBtn.addEventListener("click", playSong);
pauseBtn.addEventListener("click", pauseResumeSong);
stopBtn.addEventListener("click", stopSong);

// timers are throttled in background tabs, so pause the song instead of letting it drift
document.addEventListener("visibilitychange", () => {
  if (document.hidden && songState === "playing") pauseResumeSong();
});

// recording
recordBtn.addEventListener("click", () => {
  if (recorder.state === "recording") stopRecording(); else startRecording();
});
recPlayBtn.addEventListener("click", () => {
  if (recorder.state === "playing") stopRecordingPlayback(); else playRecording();
});
recClearBtn.addEventListener("click", clearRecording);

// start-up
selectSong(0);
updateRecordUI();
