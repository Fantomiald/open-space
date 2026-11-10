import type { Dictionary } from '../index.ts';
import { automata } from './automata.ts';
import { board } from './board.ts';
import { branches } from './branches.ts';
import { common } from './common.ts';
import { composer } from './composer.ts';
import { metrics } from './metrics.ts';
import { mods } from './mods.ts';
import { room } from './room.ts';
import { search } from './search.ts';
import { usage } from './usage.ts';
import { session } from './session.ts';
import { settings } from './settings.ts';

export const en: Dictionary = { common, session, composer, settings, room, board, metrics, mods, automata, search, usage, branches };
