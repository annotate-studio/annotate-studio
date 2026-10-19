import { closeSearchPanel, findNext, findPrevious, replaceAll, replaceNext, search, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView, type Panel, type ViewUpdate } from '@codemirror/view';

interface MatchRange {
  from: number;
  to: number;
}

const MAX_MATCHES = 1000;

const ICONS = {
  search: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="m18 15-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  replace: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 7h11l-3-3M20 17H9l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatches(text: string, query: SearchQuery): MatchRange[] {
  const ranges: MatchRange[] = [];
  const needle = query.search;
  if (!needle) return ranges;
  if (query.regexp || query.wholeWord) {
    const source = query.wholeWord && !query.regexp ? `\\b(?:${escapeRegExp(needle)})\\b` : query.wholeWord ? `(?<![\\w\\p{L}])(?:${needle})(?![\\w\\p{L}])` : needle;
    let re: RegExp | null = null;
    for (const flags of [query.caseSensitive ? 'gu' : 'giu', query.caseSensitive ? 'g' : 'gi']) {
      try {
        re = new RegExp(source, flags);
        break;
      } catch {
        re = null;
      }
    }
    if (!re) return ranges;
    for (const match of text.matchAll(re)) {
      if (match[0]) ranges.push({ from: match.index, to: match.index + match[0].length });
      if (ranges.length >= MAX_MATCHES) break;
    }
    return ranges;
  }
  const haystack = query.caseSensitive ? text : text.toLowerCase();
  const target = query.caseSensitive ? needle : needle.toLowerCase();
  let index = 0;
  while (ranges.length < MAX_MATCHES) {
    const found = haystack.indexOf(target, index);
    if (found < 0) break;
    ranges.push({ from: found, to: found + target.length });
    index = found + Math.max(1, target.length);
  }
  return ranges;
}

function currentIndex(ranges: MatchRange[], head: number): number {
  for (let i = 0; i < ranges.length; i += 1) {
    if (head <= ranges[i].to) return i;
  }
  return 0;
}

class MarkdownSearchPanel implements Panel {
  dom: HTMLElement;
  private view: EditorView;
  private findInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private countLabel: HTMLElement;
  private toggles = new Map<string, HTMLButtonElement>();
  private options = { caseSensitive: false, wholeWord: false, regexp: false };
  private query = new SearchQuery({ search: '' });

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement('div');
    this.dom.className = 'md-search-panel';

    const findRow = document.createElement('div');
    findRow.className = 'md-search-row';
    findRow.innerHTML =
      `<span class="md-search-icon">${ICONS.search}</span>` +
      '<input class="md-search-input md-search-find" type="text" placeholder="Find in note…" aria-label="Find" spellcheck="false" autocomplete="off" />' +
      '<span class="md-search-count"></span>' +
      '<button type="button" class="md-search-toggle" data-opt="caseSensitive" title="Match case">Aa</button>' +
      '<button type="button" class="md-search-toggle" data-opt="wholeWord" title="Match whole word">W</button>' +
      '<button type="button" class="md-search-toggle" data-opt="regexp" title="Regular expression">.*</button>' +
      '<button type="button" class="md-search-btn" data-act="prev" title="Previous match (Shift+Enter)" aria-label="Previous match">' +
      `${ICONS.up}</button>` +
      '<button type="button" class="md-search-btn" data-act="next" title="Next match (Enter)" aria-label="Next match">' +
      `${ICONS.down}</button>` +
      '<button type="button" class="md-search-btn md-search-close" data-act="close" title="Close (Esc)" aria-label="Close search">' +
      `${ICONS.close}</button>`;

    const replaceRow = document.createElement('div');
    replaceRow.className = 'md-search-row md-search-replace-row';
    replaceRow.innerHTML =
      `<span class="md-search-icon">${ICONS.replace}</span>` +
      '<input class="md-search-input md-search-replace" type="text" placeholder="Replace with…" aria-label="Replace with" spellcheck="false" autocomplete="off" />' +
      '<button type="button" class="md-search-action" data-act="replace" title="Replace this match (Ctrl+Enter)">Replace</button>' +
      '<button type="button" class="md-search-action md-search-all" data-act="replaceAll" title="Replace all (Ctrl+Shift+Enter)">All</button>';

    this.dom.append(findRow, replaceRow);
    this.findInput = findRow.querySelector('.md-search-find') as HTMLInputElement;
    this.replaceInput = replaceRow.querySelector('.md-search-replace') as HTMLInputElement;
    this.countLabel = findRow.querySelector('.md-search-count') as HTMLElement;
    findRow.querySelectorAll<HTMLButtonElement>('.md-search-toggle').forEach((button) => {
      const option = button.dataset.opt ?? '';
      this.toggles.set(option, button);
      button.addEventListener('click', () => {
        this.options = { ...this.options, [option]: !this.options[option as keyof typeof this.options] };
        button.classList.toggle('active');
        this.applyQuery();
        this.findInput.focus();
      });
    });
    this.dom.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((button) => {
      button.addEventListener('click', () => this.act(button.dataset.act ?? ''));
    });
    this.findInput.addEventListener('input', () => this.applyQuery());
    this.findInput.addEventListener('keydown', (event) => this.onKeyDown(event, false));
    this.replaceInput.addEventListener('keydown', (event) => this.onKeyDown(event, true));
    this.refresh(view);
  }

  mount() {
    this.findInput.focus();
    this.findInput.select();
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) this.refresh(update.view);
  }

  private onKeyDown(event: KeyboardEvent, inReplace: boolean) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Enter' && mod) {
      event.preventDefault();
      replaceAll(this.view);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (inReplace) replaceNext(this.view);
      else if (event.shiftKey) findPrevious(this.view);
      else findNext(this.view);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(this.view);
    }
  }

  private act(action: string) {
    if (action === 'next') findNext(this.view);
    else if (action === 'prev') findPrevious(this.view);
    else if (action === 'replace') replaceNext(this.view);
    else if (action === 'replaceAll') replaceAll(this.view);
    else if (action === 'close') closeSearchPanel(this.view);
  }

  private applyQuery() {
    this.query = new SearchQuery({
      search: this.findInput.value,
      replace: this.replaceInput.value,
      caseSensitive: this.options.caseSensitive,
      wholeWord: this.options.wholeWord,
      regexp: this.options.regexp,
    });
    this.view.dispatch({ effects: setSearchQuery.of(this.query) });
    this.refresh(this.view);
  }

  private refresh(view: EditorView) {
    if (!this.query.search) {
      this.countLabel.textContent = '';
      return;
    }
    const text = view.state.doc.sliceString(0, 1_000_000);
    const matches = collectMatches(text, this.query);
    if (matches.length === 0) {
      this.countLabel.textContent = 'No matches';
      this.countLabel.classList.add('md-search-count-empty');
      return;
    }
    this.countLabel.classList.remove('md-search-count-empty');
    const head = view.state.selection.main.head;
    this.countLabel.textContent = `${currentIndex(matches, head) + 1} / ${matches.length}`;
  }
}

export function searchPanel() {
  return search({ createPanel: (view) => new MarkdownSearchPanel(view) });
}
