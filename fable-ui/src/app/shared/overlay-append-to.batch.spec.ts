import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * Batch 1 dialog overlays that must portal to body to avoid nested scroll fighting.
 * Kept in sync with the high-priority triage from scripts/audit-overlay-scroll.py.
 */
const BATCH_TEMPLATES: {path: string; markers: RegExp[]}[] = [
  {
    path: 'src/app/features/book/components/bulk-isbn-import-dialog/bulk-isbn-import-dialog.component.html',
    markers: [
      /id="library"[\s\S]*?appendTo="body"/,
      /id="libraryPath"[\s\S]*?appendTo="body"/
    ]
  },
  {
    path: 'src/app/features/book/components/add-physical-book-dialog/add-physical-book-dialog.component.html',
    markers: [
      /id="library"[\s\S]*?appendTo="body"/,
      /id="libraryPath"[\s\S]*?appendTo="body"/
    ]
  },
  {
    path: 'src/app/features/book/components/additional-file-uploader/additional-file-uploader.component.html',
    markers: [/<p-select[\s\S]*?appendTo="body"/]
  },
  {
    path: 'src/app/features/settings/ai-settings/ai-scan-directory-dialog/ai-scan-directory-dialog.component.html',
    markers: [/<p-multiSelect[\s\S]*?appendTo="body"/]
  },
  {
    path: 'src/app/shared/components/book-uploader/book-uploader.component.html',
    markers: [
      /inputId="library-select"[\s\S]*?appendTo="body"/,
      /inputId="subpath-select"[\s\S]*?appendTo="body"/
    ]
  },
  {
    path: 'src/app/features/book/components/book-file-attacher/book-file-attacher.component.html',
    markers: [/<p-autocomplete[\s\S]*?appendTo="body"/]
  }
];

describe('dialog overlay appendTo batch (scroll-fight prevention)', () => {
  for (const entry of BATCH_TEMPLATES) {
    it(`${entry.path} portals overlay controls to body`, () => {
      const template = readFileSync(join(process.cwd(), entry.path), 'utf8');
      for (const marker of entry.markers) {
        expect(template).toMatch(marker);
      }
    });
  }
});
