import { Compartment, Facet, RangeSetBuilder, StateField, type Extension, type Text } from '@codemirror/state';
import { Decoration, Direction, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { countLetters, dominantDirection, ltrSyntaxSpans, resolveDirection, type DirectionMode, type TextDirection } from '@/lib/bidi';
import { documentKind } from './latex-assist';

export const directionMode = Facet.define<DirectionMode, DirectionMode>({
  combine: (values) => values[values.length - 1] ?? 'auto',
});

export const directionCompartment = new Compartment();

function documentSample(doc: Text): string {
  return doc.sliceString(0, Math.min(doc.length, 20_000));
}

const documentDirection = StateField.define<TextDirection>({
  create: (state) => dominantDirection(documentSample(state.doc)),
  update: (value, tr) => {
    if (!tr.docChanged) return value;
    if (tr.state.doc.length > 40_000 && tr.startState.doc.length > 40_000) return value;
    return dominantDirection(documentSample(tr.state.doc));
  },
});

const LTR_BLOCKS = new Set(['FencedCode', 'CodeBlock', 'BlockMath', 'HTMLBlock', 'CommentBlock']);
const LTR_ISOLATE = Decoration.mark({ bidiIsolate: Direction.LTR, attributes: { dir: 'ltr' } });
const ISOLATED_INLINE = new Set(['InlineCode', 'InlineMath', 'URL', 'HTMLTag', 'Autolink', 'Entity', 'HeaderMark', 'QuoteMark', 'ListMark']);

const BLOCK_MARKS = /^\s*(?:#{1,6}\s*|>\s?|[-*+]\s|\d+[.)]\s)/;

/**
 * Direction of a line is decided by its content, not by the markdown marks in
 * front of it: `# سرفصل` is Persian text with an LTR hashtag, so the mark is
 * isolated and the sentence aligns to the right.
 */
function stripBlockMarks(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const match = BLOCK_MARKS.exec(out);
    if (!match) break;
    out = out.slice(match[0].length);
  }
  return out;
}

const lineRtl = Decoration.line({ attributes: { dir: 'rtl' } });
const lineLtr = Decoration.line({ attributes: { dir: 'ltr' } });

interface BidiDecorations {
  lines: DecorationSet;
  isolates: DecorationSet;
}

function build(view: EditorView): BidiDecorations {
  const mode = view.state.facet(directionMode);
  const fallback = mode === 'auto' ? view.state.field(documentDirection) : mode;
  const latexDocument = view.state.facet(documentKind) === 'latex';
  const tree = syntaxTree(view.state);
  const ltrRanges: { from: number; to: number }[] = [];
  const isolates: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (LTR_BLOCKS.has(node.name)) {
          ltrRanges.push({ from: node.from, to: node.to });
          return false;
        }
        if (ISOLATED_INLINE.has(node.name)) {
          if (node.to > node.from) isolates.push({ from: node.from, to: node.to, deco: LTR_ISOLATE });
          return false;
        }
        return undefined;
      },
    });
  }
  const lines = new RangeSetBuilder<Decoration>();
  let previous: TextDirection | null = null;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const inLtrBlock = ltrRanges.some((range) => line.from >= range.from && line.from <= range.to);
      let direction: TextDirection;
      if (inLtrBlock) direction = 'ltr';
      else if (mode !== 'auto') direction = mode;
      else if (line.text.trim()) {
        direction = latexDocument && countLetters(line.text).rtl === 0 ? 'ltr' : resolveDirection(stripBlockMarks(line.text), previous ?? fallback);
        previous = direction;
      } else {
        direction = previous ?? fallback;
        previous = null;
      }
      lines.add(line.from, line.from, direction === 'rtl' ? lineRtl : lineLtr);
      if (direction === 'rtl') {
        for (const span of ltrSyntaxSpans(line.text)) isolates.push({ from: line.from + span.from, to: line.from + span.to, deco: LTR_ISOLATE });
      }
      if (line.to + 1 > to) break;
      pos = line.to + 1;
    }
  }
  isolates.sort((a, b) => a.from - b.from || a.to - b.to);
  const isolateBuilder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const range of isolates) {
    if (range.from < lastTo) continue;
    isolateBuilder.add(range.from, range.to, range.deco);
    lastTo = range.to;
  }
  return { lines: lines.finish(), isolates: isolateBuilder.finish() };
}

const bidiPlugin = ViewPlugin.fromClass(
  class {
    lines: DecorationSet;
    isolates: DecorationSet;
    constructor(view: EditorView) {
      const built = build(view);
      this.lines = built.lines;
      this.isolates = built.isolates;
    }
    update(update: ViewUpdate) {
      const modeChanged = update.startState.facet(directionMode) !== update.state.facet(directionMode);
      if (update.docChanged || update.viewportChanged || modeChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        const built = build(update.view);
        this.lines = built.lines;
        this.isolates = built.isolates;
      }
    }
  },
  {
    provide: (plugin) => [
      EditorView.decorations.of((view) => view.plugin(plugin)?.lines ?? Decoration.none),
      EditorView.decorations.of((view) => view.plugin(plugin)?.isolates ?? Decoration.none),
      EditorView.bidiIsolatedRanges.of((view) => view.plugin(plugin)?.isolates ?? Decoration.none),
    ],
  },
);

export function bidiSupport(mode: DirectionMode): Extension {
  return [documentDirection, directionCompartment.of(directionMode.of(mode)), EditorView.perLineTextDirection.of(true), bidiPlugin];
}

export function setDirectionMode(view: EditorView, mode: DirectionMode) {
  view.dispatch({ effects: directionCompartment.reconfigure(directionMode.of(mode)) });
}

export const insertZeroWidthNonJoiner = (view: EditorView): boolean => {
  if (view.state.readOnly) return false;
  view.dispatch(view.state.replaceSelection('‌'), { scrollIntoView: true, userEvent: 'input.type' });
  return true;
};
