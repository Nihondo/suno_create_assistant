import { describe, expect, it } from 'vitest';
import { isCreatePath, isPageNavigation } from '../src/suno/route';

describe('isCreatePath', () => {
  it('accepts the Create page and its sub-paths', () => {
    expect(isCreatePath('/create')).toBe(true);
    expect(isCreatePath('/create/')).toBe(true);
    expect(isCreatePath('/create/something')).toBe(true);
  });

  it('rejects other pages, including ones that merely start with "create"', () => {
    expect(isCreatePath('/')).toBe(false);
    expect(isCreatePath('/discover')).toBe(false);
    expect(isCreatePath('/song/abc')).toBe(false);
    expect(isCreatePath('/creator')).toBe(false);
    expect(isCreatePath('/me/create')).toBe(false);
  });
});

describe('isPageNavigation', () => {
  it('treats http(s) URLs as navigations and download/blob URLs as not', () => {
    expect(isPageNavigation(new URL('https://suno.com/create'))).toBe(true);
    expect(isPageNavigation(new URL('blob:https://suno.com/2f1c-uuid'))).toBe(false);
    expect(isPageNavigation(new URL('data:text/plain,hi'))).toBe(false);
  });
});
