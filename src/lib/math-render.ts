import katex from 'katex';
import 'katex/contrib/mhchem';
import type { MacroMap } from './latex';

export interface RenderedMath {
  html: string;
  error: string | null;
}

const CACHE_LIMIT = 4000;
const cache = new Map<string, RenderedMath>();
const EMPTY_MACROS: MacroMap = {};

function remember(key: string, value: RenderedMath): RenderedMath {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

export function renderMath(latex: string, display: boolean, macros: MacroMap = EMPTY_MACROS, macrosKey = ''): RenderedMath {
  const key = `${display ? 'D' : 'I'}\u0000${macrosKey}\u0000${latex}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const hasMacros = macrosKey.length > 0;
  const options = {
    displayMode: display,
    strict: 'ignore' as const,
    macros: hasMacros ? { ...macros } : undefined,
    output: 'htmlAndMathml' as const,
  };
  try {
    return remember(key, { html: katex.renderToString(latex, { ...options, throwOnError: true }), error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : String(error);
    try {
      return remember(key, {
        html: katex.renderToString(latex, {
          ...options,
          macros: hasMacros ? { ...macros } : undefined,
          throwOnError: false,
          errorColor: 'var(--danger)',
        }),
        error: message,
      });
    } catch {
      return remember(key, { html: '', error: message });
    }
  }
}

export function mathError(latex: string, display: boolean, macros: MacroMap = {}, macrosKey = ''): string | null {
  return renderMath(latex, display, macros, macrosKey).error;
}
