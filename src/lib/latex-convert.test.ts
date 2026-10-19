import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latexToMarkdown, markdownToLatex } from './latex-convert.ts';
import { parseMarkdown } from './markdown.ts';

const DOCUMENT = `\\documentclass{article}
\\usepackage{amsmath}
\\newtheorem{thm}{Theorem}
\\newcommand{\\R}{\\mathbb{R}}
\\title{Notes on \\emph{Analysis}}
\\author{Ada}
\\begin{document}
\\maketitle
\\section{Introduction}\\label{sec:intro}
We study $f\\colon \\R \\to \\R$ in Section~\\ref{sec:intro}.% a comment
\\begin{itemize}
  \\item First \\textbf{point}
  \\item Second with \\footnote{A note.}
\\end{itemize}
\\begin{thm}[Main]\\label{thm:main}
Every bounded sequence has a convergent subsequence.
\\end{thm}
\\begin{equation}\\label{eq:1}
  e^{i\\pi} + 1 = 0
\\end{equation}
\\begin{tabular}{lr}
  \\hline
  a & b \\\\
  c & d \\\\
  \\hline
\\end{tabular}
\\begin{verbatim}
x = **raw**
\\end{verbatim}
\\end{document}`;

test('converts a LaTeX document into renderable Markdown', () => {
  const markdown = latexToMarkdown(DOCUMENT);
  assert.ok(markdown.includes('\\newcommand{\\R}{\\mathbb{R}}'));
  assert.ok(markdown.includes('# Notes on *Analysis*'));
  assert.ok(markdown.includes('## 1 Introduction'));
  assert.ok(markdown.includes('Section\u00a01'));
  assert.ok(!markdown.includes('a comment'));
  assert.ok(markdown.includes('- First **point**'));
  assert.ok(markdown.includes('[^1]'));
  assert.ok(markdown.includes('[^1]: A note.'));
  assert.ok(markdown.includes('\\begin{theorem}[Main]\\label{thm:main}'));
  assert.ok(markdown.includes('\\begin{equation}'));
  assert.ok(markdown.includes('| a | b |'));
  assert.ok(markdown.includes('| :--- | ---: |'));
  assert.ok(markdown.includes('```\nx = **raw**\n```'));
  const blocks = parseMarkdown(markdown);
  assert.ok(blocks.some((block) => block.type === 'env' && block.name === 'theorem'));
  assert.ok(blocks.some((block) => block.type === 'table'));
});

test('handles Persian xepersian documents', () => {
  const markdown = latexToMarkdown('\\usepackage{xepersian}\n\\begin{document}\n\\section{مقدمه}\nمتن \\lr{LaTeX} فارسی.\n\\end{document}');
  assert.ok(markdown.includes('## ۱ مقدمه'));
  assert.ok(markdown.includes('متن LaTeX فارسی.'));
});

test('exports Markdown notes to LaTeX', () => {
  const latex = markdownToLatex('# Title\n\n## Part\n\nSome **bold** and $x^2$ with 50% off.\n\n- one\n- two\n\n\\begin{theorem}\nT\n\\end{theorem}\n\n| a | b |\n| - | -: |\n| 1 | 2 |');
  assert.ok(latex.includes('\\title{Title}'));
  assert.ok(latex.includes('\\section{Part}'));
  assert.ok(latex.includes('\\textbf{bold}'));
  assert.ok(latex.includes('$x^2$'));
  assert.ok(latex.includes('50\\%'));
  assert.ok(latex.includes('\\begin{itemize}'));
  assert.ok(latex.includes('\\newtheorem{theorem}{Theorem}'));
  assert.ok(latex.includes('\\begin{tabular}{|l|r|}'));
  assert.ok(!latex.includes('xepersian'));
});

test('exports Persian notes with xepersian and wraps Latin words', () => {
  const latex = markdownToLatex('# جزوه\n\nزبان Rust امن است.\n\n\\begin{proof}\nبدیهی\n\\end{proof}');
  assert.ok(latex.includes('\\usepackage{xepersian}'));
  assert.ok(latex.indexOf('xepersian') > latex.indexOf('hyperref'));
  assert.ok(latex.includes('\\lr{Rust}'));
  assert.ok(latex.includes('\\renewcommand{\\proofname}{اثبات}'));
});

test('resolves @-image references when exporting to LaTeX', () => {
  const resolved = markdownToLatex('[A figure](@diagram.png)', {
    resolveImage: (target) => (target === 'diagram.png' ? 'documents/diagram.png' : null),
  });
  assert.ok(resolved.includes('\\includegraphics[width=0.8\\linewidth]{diagram.png}'));
  const plain = markdownToLatex('![caption](@scan.jpg)');
  assert.ok(plain.includes('\\includegraphics[width=0.8\\linewidth]{scan.jpg}'));
});
