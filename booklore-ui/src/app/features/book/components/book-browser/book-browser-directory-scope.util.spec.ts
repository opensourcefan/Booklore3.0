import {describe, expect, it} from 'vitest';
import {isDirectoryScopeActive} from './book-browser-directory-scope.util';

describe('isDirectoryScopeActive', () => {
  it('treats a root directory selection as an active scope', () => {
    expect(isDirectoryScopeActive('')).toBe(true);
  });

  it('treats nested directory selections as an active scope', () => {
    expect(isDirectoryScopeActive('Comics/Marvel')).toBe(true);
  });

  it('treats a null directory selection as inactive', () => {
    expect(isDirectoryScopeActive(null)).toBe(false);
  });
});