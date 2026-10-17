// Safe accessors for JSON coming from outside (claude's stream, WebSocket clients). No `any` anywhere.
export type Json = { readonly [key: string]: unknown };

export const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
export const asJson = (value: unknown): Json => (isJson(value) ? value : {});
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
export const asNumber = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
