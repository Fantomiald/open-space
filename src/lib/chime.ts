// A short ding when a session finishes or needs the user, synthesised with the Web Audio API (no sound file), and
// macOS's "Basso" when one fails (served by the bridge, see server/sounds.ts; a low tone of our own where it is
// missing). Browsers keep a page silent until it gets a click or a key press, so the first one unlocks the sound.
import type { AttentionItem } from '../state/queue.ts';

let context: AudioContext | null = null;
let lastChimeAt = 0;
let errorSound: Promise<AudioBuffer | null> | null = null;
const FINISHED = 659.25;
const WAITING = 880;
/** Several sessions finishing together ring once. */
const QUIET_MS = 400;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  return context;
}

/** Called on the page's first clicks and key presses: the sound can play from then on. */
export function unlockChime() {
  const sound = audio();
  if (sound?.state === 'suspended') void sound.resume();
}

/** One bell stroke: a sine and its octave, struck at `at` (seconds on the context's clock) and fading out. */
function strike(sound: AudioContext, frequency: number, at: number) {
  for (const [ratio, level] of [[1, 0.22], [2, 0.06]] as const) {
    const tone = sound.createOscillator();
    const volume = sound.createGain();
    tone.type = 'sine';
    tone.frequency.value = frequency * ratio;
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(level, at + 0.008);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    tone.connect(volume).connect(sound.destination);
    tone.start(at);
    tone.stop(at + 0.95);
  }
}

/** A finished turn rings once; a question or a permission, which blocks the session, rings twice. */
export function chime(items: readonly AttentionItem[]) {
  const sound = audio();
  if (!items.length || !sound || sound.state !== 'running') return;
  if (performance.now() - lastChimeAt < QUIET_MS) return;
  lastChimeAt = performance.now();
  const blocked = items.some(({ kind }) => kind === 'permission' || kind === 'question');
  const now = sound.currentTime;
  strike(sound, FINISHED, now);
  if (blocked) strike(sound, WAITING, now + 0.16);
}

/** A session that just failed. */
export function errorChime() {
  const sound = audio();
  if (sound?.state !== 'running') return;
  errorSound ??= fetch('/sounds/error.wav')
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
    .then((data) => sound.decodeAudioData(data))
    .catch(() => null);
  void errorSound.then((buffer) => {
    if (!buffer) { strike(sound, 196, sound.currentTime); return; }
    const source = sound.createBufferSource();
    source.buffer = buffer;
    source.connect(sound.destination);
    source.start();
  });
}

/** Rings once at once, to hear the sound when it is turned on (called from that click, which also unlocks it). */
export function sampleChime() {
  const sound = audio();
  if (!sound) return;
  void sound.resume().then(() => strike(sound, FINISHED, sound.currentTime));
}
