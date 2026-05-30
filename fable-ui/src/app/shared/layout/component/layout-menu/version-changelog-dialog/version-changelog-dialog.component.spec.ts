import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {VersionChangelogDialogComponent} from './version-changelog-dialog.component';
import {VersionService} from '../../../../service/version.service';

describe('VersionChangelogDialogComponent', () => {
  let component: VersionChangelogDialogComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {provide: VersionService, useValue: {getChangelog: vi.fn().mockReturnValue(of([]))}},
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
      ]
    });

    component = TestBed.runInInjectionContext(() => new VersionChangelogDialogComponent());
  });

  it('renders markdown tables, demotes h2 headings to h3, and sanitizes unsafe html', () => {
    const html = component.markdownToHtml('## Highlights\n\n| Item | Status |\n| --- | --- |\n| Audit | done |\n\n<script>alert(1)</script>');

    expect(html).toContain('<h3>Highlights</h3>');
    expect(html).toContain('<table>');
    expect(html).not.toContain('<script');
  });
});
