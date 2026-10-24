export const TERMINALS = ['cmd', 'powershell', 'git-bash'] as const;
export type TerminalKind = (typeof TERMINALS)[number];
export interface TerminalChoice { id: TerminalKind; name: string; path: string }
