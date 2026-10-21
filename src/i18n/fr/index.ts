// French, the reference: its shape is the Dictionary every other language follows.
import { board } from './board.ts';
import { branches } from './branches.ts';
import { common } from './common.ts';
import { composer } from './composer.ts';
import { metrics } from './metrics.ts';
import { room } from './room.ts';
import { search } from './search.ts';
import { usage } from './usage.ts';
import { session } from './session.ts';
import { settings } from './settings.ts';

export const fr = { common, session, composer, settings, room, board, metrics, search, usage, branches };
