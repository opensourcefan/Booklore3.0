import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('Shared loading indicator adoption', () => {
  it('uses the shared loading indicator component in the splash and All Books loaders', () => {
    const appTemplate = readWorkspaceFile('src/app/app.component.html');
    const browserTemplate = readWorkspaceFile('src/app/features/book/components/book-browser/book-browser.component.html');
    const loadingStartIndex = browserTemplate.indexOf('<div class="book-browser-loading-state">');
    const loadingEndIndex = browserTemplate.indexOf('</app-loading-indicator>', loadingStartIndex);
    const loadingBlock = loadingStartIndex >= 0 ? browserTemplate.substring(loadingStartIndex, loadingEndIndex + 24) : '';

    expect(appTemplate).toContain('<app-loading-indicator class="loader-picture" [decorative]="true"></app-loading-indicator>');
    expect(loadingBlock).toContain('<app-loading-indicator class="book-browser-loading-spinner" alt="Loading books"></app-loading-indicator>');
    expect(loadingBlock).not.toMatch(/p-progressSpinner|p-progress-spinner/);
  });

  it('uses the shared loading indicator component in the reader and library loading overlays', () => {
    const ebookTemplate = readWorkspaceFile('src/app/features/readers/ebook-reader/ebook-reader.component.html');
    const cbxTemplate = readWorkspaceFile('src/app/features/readers/cbx-reader/cbx-reader.component.html');
    const libraryLoadingTemplate = readWorkspaceFile('src/app/features/library-creator/library-loading/library-loading.component.html');
    const metadataReviewTemplate = readWorkspaceFile('src/app/features/metadata/component/metadata-review-dialog/metadata-review-dialog-component.html');

    expect(ebookTemplate).toContain('<app-loading-indicator class="loader-indicator" [decorative]="true"></app-loading-indicator>');
    expect(ebookTemplate).not.toContain('<div class="spinner"></div>');

    expect(cbxTemplate).toContain('<app-loading-indicator class="loader-indicator" [decorative]="true"></app-loading-indicator>');
    expect(cbxTemplate).toContain('<app-loading-indicator class="ai-scan-loading-indicator" [decorative]="true" [width]="44" [height]="34"></app-loading-indicator>');
    expect(cbxTemplate).not.toContain('<div class="ai-scan-spinner"></div>');
    expect(cbxTemplate).not.toContain('<div class="spinner"></div>');

    expect(libraryLoadingTemplate).toContain('<app-loading-indicator class="library-loader-indicator" [decorative]="true"></app-loading-indicator>');
    expect(libraryLoadingTemplate).not.toContain('<div class="dot"></div>');

    expect(metadataReviewTemplate).toContain('<app-loading-indicator class="metadata-review-loading-indicator" alt="Loading metadata review" [width]="36" [height]="28"></app-loading-indicator>');
    expect(metadataReviewTemplate).not.toMatch(/p-progressSpinner|p-progress-spinner/);
  });
});