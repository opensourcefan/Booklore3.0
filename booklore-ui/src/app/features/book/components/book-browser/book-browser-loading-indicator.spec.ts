import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

describe('BookBrowserComponent loading indicator', () => {
  it('uses the shared loading indicator component for the All Books loading state', () => {
    const templatePath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-browser.component.html');
    const template = readFileSync(templatePath, 'utf8');
    const loadingBlock = template.match(/<div class="book-browser-loading-state">[\s\S]*?<\/div>/)?.[0] ?? '';

    expect(loadingBlock).toContain('<app-loading-indicator class="book-browser-loading-spinner" alt="Loading books"></app-loading-indicator>');
    expect(loadingBlock).not.toMatch(/p-progressSpinner|p-progress-spinner/);
  });

  it('reuses the same shared loading indicator component as the app splash screen', () => {
    const appTemplatePath = join(process.cwd(), 'src/app/app.component.html');
    const appTemplate = readFileSync(appTemplatePath, 'utf8');

    expect(appTemplate).toContain('<app-loading-indicator class="loader-picture" [decorative]="true"></app-loading-indicator>');
  });
});