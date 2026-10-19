import type { StudyFile } from './tauri-commands';
import { baseName, stripExtension } from './utils';

/**
 * Markdown images can reference workspace files with the `@file_name` shorthand:
 *
 *   [a small description](@figure.png)
 *   ![caption](@notes/scan.jpg)
 *
 * The `@` prefix tells the app to resolve the name against the files in the
 * current workspace instead of treating it as a URL.
 */
export function isWorkspaceImageReference(src: string): boolean {
  return src.startsWith('@');
}

export function workspaceImageTarget(src: string): string {
  return (isWorkspaceImageReference(src) ? src.slice(1) : src).trim();
}

/**
 * Resolves `@name` (or a plain relative name) to a workspace-relative path by
 * matching the target against the library files. Tries exact paths first, then
 * matches by file name, with or without the extension.
 */
export function resolveWorkspaceImage(target: string, files: StudyFile[]): string | null {
  const raw = workspaceImageTarget(target).replace(/\\/g, '/');
  if (!raw) return null;
  const cleaned = raw.replace(/^\.\//, '');
  const name = baseName(cleaned);
  const candidates = [cleaned, `notes/${cleaned}`, `documents/${cleaned}`];
  const exact = files.find((file) => candidates.includes(file.path));
  if (exact) return exact.path;
  const wanted = stripExtension(name).toLowerCase();
  const byName = files.find(
    (file) =>
      file.file_type === 'Image' &&
      (file.name.toLowerCase() === name.toLowerCase() || stripExtension(file.name).toLowerCase() === wanted),
  );
  return byName ? byName.path : null;
}
