function normalizeChoice(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[*_`"'“”‘’]/g, '')
    .replace(/[.,;:!?()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function letterIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function resolveAnswer(options: string[], answer: unknown): string | null {
  if (typeof answer === 'number') return Number.isInteger(answer) ? options[answer] ?? null : null;
  if (typeof answer !== 'string') return null;
  const trimmed = answer.trim();
  if (!trimmed) return null;
  const normalizedOptions = options.map(normalizeChoice);
  const byText = (value: string) => {
    const target = normalizeChoice(value);
    const index = target ? normalizedOptions.indexOf(target) : -1;
    return index >= 0 ? options[index] : null;
  };
  const containing = (value: string) => {
    const target = ` ${normalizeChoice(value)} `;
    if (target.trim().length < 2) return null;
    const hits = options.filter((_, index) => {
      const option = ` ${normalizedOptions[index]} `;
      return option.trim().length > 0 && (target.includes(option) || option.includes(target));
    });
    return hits.length === 1 ? hits[0] : null;
  };
  const direct = options.find((option) => option.trim() === trimmed) ?? byText(trimmed);
  if (direct) return direct;
  const lone = /^(?:(?:option|answer|choice)\s*:?\s*)?\(?([A-Fa-f])\)?[.:]?$/i.exec(trimmed);
  if (lone) return options[letterIndex(lone[1])] ?? null;
  const prefixed = /^\(?([A-Fa-f])(?:[).:]|\s+[-–—])\s*([\s\S]*)$/.exec(trimmed);
  if (prefixed) {
    const rest = prefixed[2].trim();
    const fromRest = rest ? byText(rest) ?? containing(rest) : null;
    if (fromRest) return fromRest;
    if (!rest) return options[letterIndex(prefixed[1])] ?? null;
  }
  return containing(trimmed);
}

export function stripLetterPrefixes(options: string[]): string[] {
  const lettered =
    options.length > 1 &&
    options.every((option, index) => new RegExp(`^\\(?${String.fromCharCode(65 + index)}[).:]\\s*\\S`, 'i').test(option));
  return lettered ? options.map((option) => option.replace(/^\(?[A-Fa-f][).:]\s*/, '').trim()) : options;
}
