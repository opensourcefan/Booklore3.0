import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

describe('BookBrowserComponent Staging Phone Mode triage row', () => {
  const htmlPath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-browser.component.html');
  const scssPath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-browser.component.scss');

  it('places Staging triage tabs on a Phone Mode row below the toolbar, not inside the title row', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/#stagingTriageTabs/);
    expect(html).toMatch(/canShowStagingTriageChrome && !isMobile/);
    expect(html).toMatch(/canShowStagingTriageChrome && isMobile/);
    expect(html).toMatch(/staging-triage-tabs--phone-row/);

    // Phone outlet must sit after the toolbar closes and before the selection panel.
    const toolbarClose = html.lastIndexOf('book-browser-toolbar');
    const phoneOutlet = html.indexOf('canShowStagingTriageChrome && isMobile');
    const selectionPanel = html.indexOf('selection-action-panel');
    expect(phoneOutlet).toBeGreaterThan(toolbarClose);
    expect(selectionPanel).toBeGreaterThan(phoneOutlet);

    // Desktop keeps the inline title-row placement; phone uses the dedicated row class.
    expect(html).toMatch(/\[class\.staging-triage-tabs--phone-row\]="isMobile"/);

    // Separator between Review and Completed is preserved in the shared template.
    const reviewTab = html.indexOf('staging-triage-tab--review');
    const separator = html.indexOf('staging-triage-separator');
    const completedTab = html.indexOf('staging-triage-tab--completed');
    expect(reviewTab).toBeGreaterThan(-1);
    expect(separator).toBeGreaterThan(reviewTab);
    expect(completedTab).toBeGreaterThan(separator);
  });

  it('styles the Phone Mode triage row to full width with a Review|Completed separator', () => {
    const scss = readFileSync(scssPath, 'utf8');

    expect(scss).toMatch(/:host-context\(body\.layout-phone\)\s*\{[\s\S]*\.staging-triage-tabs--phone-row/);
    expect(scss).toMatch(/\.staging-triage-tabs--phone-row[\s\S]*width:\s*100%/);
    expect(scss).toMatch(/\.staging-triage-tabs--phone-row[\s\S]*flex-wrap:\s*nowrap/);
    expect(scss).toMatch(/\.staging-triage-tab\s*\{[\s\S]*flex:\s*1 1 0/);
    expect(scss).toMatch(/\.staging-triage-separator[\s\S]*flex:\s*0 0 auto/);
    expect(scss).toMatch(
      /:host-context\(body\.layout-phone\.header-bottom\)\s*\{[\s\S]*\.staging-triage-tabs--phone-row[\s\S]*order:\s*-1/
    );
  });
});
