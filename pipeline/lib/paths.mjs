import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CACHE = join(ROOT, '.cache');
export const BUILD = join(ROOT, 'build');
export const DATA = join(ROOT, 'data');
export const DIST = join(ROOT, 'dist');
export const src = (id, file) => join(CACHE, 'sources', id, file);
