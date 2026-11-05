// The page behind the cellar, in sky pixels (sky.ts): a black cave, its rock hanging from above and rising from below,
// and on the layer that moves the terminal's text, drifting up the dark as lines are typed at the bottom.
import { CELLAR_PALETTE as K } from '../../design/theme-cellar.ts';
import { css, mix, rgb } from '../lighting.ts';
import { pick } from '../sky.ts';
import { glyphRows, type Context } from '../wall-art.ts';
import { noise } from './dungeon-art.ts';

function dot(context: Context, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(x, y, 1, 1);
}

export function paintCaveDark(context: Context, width: number, height: number) {
  for (let y = 0; y < height; y += 3) {
    context.fillStyle = css(mix(rgb(K.voidTop), rgb(K.voidBottom), y / height));
    context.fillRect(0, y, width, 3);
  }
  for (let x = 0; x < width; x++) {
    const hanging = Math.round(height * (0.02 + noise('cellarvault', x, 0, 22) * 0.07) + Math.max(0, noise('cellarspike', x, 0, 5) - 0.6) * height * 0.2);
    for (let y = 0; y < hanging; y++) dot(context, x, y, y === hanging - 1 ? K.caveEdge : K.caveNear);
    const rising = Math.round(height * (0.03 + noise('cellarground', x, 0, 28) * 0.09));
    for (let y = height - rising; y < height; y++) dot(context, x, y, y === height - rising ? K.caveEdge : K.caveNear);
  }
}

const LINES = [
  '$ SSH ROOT@10.0.0.7', 'PASSWORD: ********', 'LAST LOGIN: 03:14:07', '$ LS -LA /VAR/LOG', '$ CD /HOME/GHOST', '$ CAT NOTES.TXT', 'WAKE UP.',
  '$ PING 127.0.0.1', '64 BYTES TTL=64', '$ MAKE ALL', 'CC MAIN.C', 'LD A.OUT', 'BUILD OK', '$ GREP -R TODO .', '$ TOP', 'LOAD: 0.42 0.37 0.31', '$ TAIL -F SYSLOG', 'KERNEL: LINK UP',
  '$ GIT LOG', 'COMMIT 4F2A9C1', '$ ./RUN.SH', 'CONNECTED.', 'HANDSHAKE OK', '$ WHOAMI', 'ROOT', '$ DATE', '$ UPTIME', '412 DAYS', '$ DF -H', '/DEV/SDA1 87%', '$ CLEAR', '$ EXIT',
];
const CHARACTER = 4, LINE = 8, COLUMN_WIDTH = 92;
const STEP_SECONDS = 1.4;

function write(context: Context, text: string, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  for (const [row, pixels] of glyphRows(text).entries()) [...pixels].forEach((pixel, column) => { if (pixel === '#') context.fillRect(x + column, y + row, 1, 1); });
}

/** Columns of text, each on its own beat: every step the column moves up a line and a new one is typed at its foot. */
export function paintTerminalText(context: Context, width: number, height: number, seconds: number) {
  context.clearRect(0, 0, width, height);
  const columns = Math.max(1, Math.floor(width / COLUMN_WIDTH));
  const spacing = width / columns;
  const rows = Math.floor(height / LINE) + 1;
  for (let column = 0; column < columns; column++) {
    const beat = STEP_SECONDS * (1 + pick(`beat${column}`, 4) / 4);
    const clock = seconds / beat + pick(`phase${column}`, 100);
    const step = Math.floor(clock);
    const x = Math.round(column * spacing + 4 + pick(`left${column}`, 8));
    for (let row = 0; row < rows; row++) {
      const index = step - (rows - 1 - row);
      const text = LINES[pick(`line${column},${index}`, LINES.length)];
      const y = row * LINE + 2;
      if (row < rows - 1) {
        // a blank line now and then, and the older a line, the dimmer
        if (pick(`blank${column},${index}`, 4) === 0) continue;
        context.globalAlpha = 0.08 + 0.3 * (row / rows);
        write(context, text, x, y, text.startsWith('$') ? K.text : K.textDim);
      } else {
        context.globalAlpha = 0.6;
        const typed = text.slice(0, Math.ceil((clock - step) * 1.6 * text.length));
        write(context, typed, x, y, K.textBright);
        if (Math.floor(seconds * 2) % 2) { context.fillStyle = K.textBright; context.fillRect(x + typed.length * CHARACTER, y, 3, 5); }
      }
    }
  }
  context.globalAlpha = 1;
}
