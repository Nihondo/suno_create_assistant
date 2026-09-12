import { describe, expect, it } from 'vitest';
import { autoTitle, composePrompt, nextBaseAfterManualEdit, validateUniqueName } from '../src/domain/logic';
import type { MasteringPrompt } from '../src/domain/models';

describe('prompt composition', () => {
  it('joins style and mastering with one newline', () => {
    expect(composePrompt('orchestra', 'wide stereo master')).toBe('orchestra\nwide stereo master');
    expect(composePrompt('orchestra', undefined)).toBe('orchestra');
    expect(composePrompt(undefined, 'wide stereo master')).toBe('wide stereo master');
  });

  it('does not truncate an overflow prompt', () => {
    expect(composePrompt('a'.repeat(1000), 'b')).toBeUndefined();
  });

  it('keeps the editable base when the known mastering suffix remains', () => {
    const mastering: MasteringPrompt = { id: '1', name: 'Master', prompt: 'master', createdAt: '', updatedAt: '' };
    expect(nextBaseAfterManualEdit('custom style\nmaster', mastering)).toBe('custom style');
    expect(nextBaseAfterManualEdit('custom style\nchanged', mastering)).toBe('custom style\nchanged');
  });
});

describe('automatic titles', () => {
  it.each([
    ['Workspace', 'ARIA', 'Workspace (ARIA)'],
    ['Workspace', '', 'Workspace'],
    ['', 'ARIA', 'ARIA'],
    ['', '', ''],
  ])('formats %s and %s', (destination, style, expected) => {
    expect(autoTitle(destination, style)).toBe(expected);
  });
});

describe('names', () => {
  it('rejects a case-insensitive duplicate while allowing its own record', () => {
    const entries = [{ id: 'one', name: 'Master', prompt: '', createdAt: '', updatedAt: '' }];
    expect(validateUniqueName('master', entries)).toBeDefined();
    expect(validateUniqueName('master', entries, 'one')).toBeUndefined();
  });
});
