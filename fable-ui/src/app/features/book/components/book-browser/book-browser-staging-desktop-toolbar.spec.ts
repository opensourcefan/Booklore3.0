import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

describe('BookBrowserComponent Staging desktop/tablet triage toolbar', () => {
  const htmlPath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-browser.component.html');
  const scssPath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-browser.component.scss');
  const i18nPath = join(process.cwd(), 'src/i18n/en/book.json');

  it('keeps desktop/tablet Staging triage on a single nowrap title-row line', () => {
    const html = readFileSync(htmlPath, 'utf8');
    const scss = readFileSync(scssPath, 'utf8');

    // Desktop/tablet still inline beside the title; phone keeps its dedicated row.
    expect(html).toMatch(/canShowStagingTriageChrome && !isMobile/);
    expect(html).toMatch(/\[class\.staging-triage-tabs--phone-row\]="isMobile"/);

    // Base title row and triage strip must not wrap (wrapping caused double-height header).
    expect(scss).toMatch(/\.entity-title-row\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(scss).toMatch(/\.staging-triage-tabs\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
  });

  it('keeps desktop/tablet Staging triage labels at content width (no forced ... ellipsis)', () => {
    const scss = readFileSync(scssPath, 'utf8');

    // flex: 1 1 0 + min-width: 0 collapsed intrinsic width and ellipsized labels
    // to "..." despite free space in the header wrapper.
    const inlineChrome = scss.match(
      /\.staging-triage-tabs\s*\{[\s\S]*?&:not\(\.staging-triage-tabs--phone-row\)\s*\{([\s\S]*?)\n  \}/
    );
    expect(inlineChrome?.[1]).toBeTruthy();
    const chrome = inlineChrome![1];
    expect(chrome).toMatch(/\.staging-triage-tab\s*\{[\s\S]*flex:\s*0 0 auto/);
    expect(chrome).toMatch(/\.staging-triage-tab\s*\{[\s\S]*min-width:\s*auto/);
    expect(chrome).toMatch(/\.staging-triage-label\s*\{[\s\S]*overflow:\s*visible/);
    expect(chrome).not.toMatch(/flex:\s*1 1 0/);
    expect(chrome).not.toMatch(/text-overflow:\s*ellipsis/);

    // Desktop: title absorbs squeeze; triage strip does not shrink.
    expect(scss).toMatch(
      /:host-context\(body\.layout-desktop\)\s*\{[\s\S]*\.staging-triage-tabs:not\(\.staging-triage-tabs--phone-row\)\s*\{[\s\S]*flex-shrink:\s*0/
    );
  });

  it('labels the completed triage tab Done, separates Review|Done, and omits the Release check icon', () => {
    const html = readFileSync(htmlPath, 'utf8');
    const i18n = JSON.parse(readFileSync(i18nPath, 'utf8')) as {
      browser: {labels: {completedTab: string}};
    };

    expect(i18n.browser.labels.completedTab).toBe('Done');

    const reviewTab = html.indexOf('staging-triage-tab--review');
    const separator = html.indexOf('staging-triage-separator');
    const completedTab = html.indexOf('staging-triage-tab--completed');
    const releaseTab = html.indexOf('staging-triage-tab--release');
    expect(reviewTab).toBeGreaterThan(-1);
    expect(separator).toBeGreaterThan(reviewTab);
    expect(completedTab).toBeGreaterThan(separator);
    expect(releaseTab).toBeGreaterThan(completedTab);

    const releaseBlock = html.slice(releaseTab, html.indexOf('</button>', releaseTab));
    expect(releaseBlock).not.toMatch(/pi-check/);
    expect(releaseBlock).toMatch(/labels\.release/);
  });
});
