import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceImageReference, resolveWorkspaceImage, workspaceImageTarget } from './images.ts';
import type { StudyFile } from './tauri-commands.ts';

const files: StudyFile[] = [
  { id: 'a', name: 'diagram.png', path: 'documents/diagram.png', file_type: 'Image', size: 1, created_at: '', modified_at: '' },
  { id: 'b', name: 'scan.JPG', path: 'documents/scan.JPG', file_type: 'Image', size: 1, created_at: '', modified_at: '' },
  { id: 'c', name: 'Lecture.md', path: 'notes/Lecture.md', file_type: 'Markdown', size: 1, created_at: '', modified_at: '' },
];

test('detects and strips the @ image prefix', () => {
  assert.equal(isWorkspaceImageReference('@diagram.png'), true);
  assert.equal(isWorkspaceImageReference('diagram.png'), false);
  assert.equal(workspaceImageTarget('@diagram.png'), 'diagram.png');
  assert.equal(workspaceImageTarget('diagram.png'), 'diagram.png');
});

test('resolves @ references against workspace images', () => {
  assert.equal(resolveWorkspaceImage('@diagram.png', files), 'documents/diagram.png');
  assert.equal(resolveWorkspaceImage('diagram.png', files), 'documents/diagram.png');
  assert.equal(resolveWorkspaceImage('@diagram', files), 'documents/diagram.png');
  assert.equal(resolveWorkspaceImage('@scan', files), 'documents/scan.JPG');
  assert.equal(resolveWorkspaceImage('@notes/Lecture.md', files), 'notes/Lecture.md');
});

test('never resolves non-image files by name', () => {
  assert.equal(resolveWorkspaceImage('@Lecture.md', files), 'notes/Lecture.md');
  assert.equal(resolveWorkspaceImage('@Lecture', files), null);
  assert.equal(resolveWorkspaceImage('@missing.png', files), null);
  assert.equal(resolveWorkspaceImage('@', files), null);
});
