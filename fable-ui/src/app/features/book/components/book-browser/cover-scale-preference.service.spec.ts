import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {MessageService} from 'primeng/api';
import {CoverScalePreferenceService} from './cover-scale-preference.service';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {TranslocoService} from '@jsverse/transloco';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';

describe('CoverScalePreferenceService title height budget', () => {
  let service: CoverScalePreferenceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CoverScalePreferenceService,
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: FailureNotificationService, useValue: {reportSafe: vi.fn()}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key}},
        {
          provide: LocalStorageService,
          useValue: {
            get: () => null,
            set: vi.fn()
          }
        }
      ]
    });
    service = TestBed.inject(CoverScalePreferenceService);
  });

  it('keeps a fixed title strip when cover scale shrinks so one text row still fits', () => {
    service.scaleFactor = 1;
    const full = service.currentCardSize;
    expect(full.width).toBe(135);
    expect(full.height).toBe(135 * 7 / 5 + service.TITLE_BAR_HEIGHT);

    service.scaleFactor = 0.7;
    const shrunk = service.currentCardSize;
    const coverHeight = Math.round(shrunk.width * 7 / 5);
    const titleSpace = shrunk.height - coverHeight;

    expect(titleSpace).toBe(service.TITLE_BAR_HEIGHT);
    expect(titleSpace).toBeGreaterThanOrEqual(31);
    // Old bug: title space scaled to ~21px and clipped the only rem-based line.
    expect(titleSpace).toBeGreaterThan(Math.round(220 * 0.7) - coverHeight);
  });

  it('adds per-row height on top of the fixed title strip', () => {
    service.scaleFactor = 0.7;
    const one = service.getCardHeightForTitleRows(1);
    const three = service.getCardHeightForTitleRows(3);
    expect(three - one).toBe(2 * service.TITLE_ROW_EXTRA_HEIGHT);
  });
});
