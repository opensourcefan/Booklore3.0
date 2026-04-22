import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';

import {MetadataFetchOptionsComponent} from './metadata-fetch-options.component';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {MetadataTaskService} from '../../../../book/service/metadata-task';

describe('MetadataFetchOptionsComponent dialog layout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetadataFetchOptionsComponent, TranslocoTestingModule.forRoot({langs: {}})],
      providers: [
        {
          provide: DynamicDialogConfig,
          useValue: {
            data: {
              libraryId: 1,
              bookIds: [10, 20],
              metadataRefreshType: 'CUSTOM',
            },
          },
        },
        {
          provide: DynamicDialogRef,
          useValue: {
            close: vi.fn(),
          },
        },
        {
          provide: TaskHelperService,
          useValue: {
            refreshMetadataTask: vi.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of({
              defaultMetadataRefreshOptions: {
                libraryId: null,
                refreshCovers: false,
                replaceMode: 'REPLACE_MISSING',
                fieldOptions: {},
                enabledFields: {},
                sourceUrl: '',
                issueNumber: '',
                issueRange: '',
              },
            }),
          },
        },
        {
          provide: MetadataTaskService,
          useValue: {
            getLatestResumableTask: vi.fn().mockReturnValue(of(null)),
            resumeTask: vi.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the target selector inside a dedicated frame below target copy', () => {
    const fixture = TestBed.createComponent(MetadataFetchOptionsComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const targetingPanel = root.querySelector('.targeting-panel') as HTMLElement;
    const targetingCopy = targetingPanel.querySelector('.targeting-copy') as HTMLElement;
    const targetingFrame = targetingPanel.querySelector('.targeting-content-frame') as HTMLElement;

    expect(targetingFrame).not.toBeNull();
    expect(targetingPanel.classList.contains('metadata-section-panel')).toBe(true);
    expect(targetingPanel.children[0]).toBe(targetingCopy);
    expect(targetingPanel.children[1]).toBe(targetingFrame);
    expect(targetingFrame.querySelector('.targeting-controls')).not.toBeNull();
    expect(targetingFrame.querySelector('.targeting-controls .target-select')).not.toBeNull();
  }, 15000);

  it('renders the advanced controls rail at the top and disables embedded child controls', () => {
    const fixture = TestBed.createComponent(MetadataFetchOptionsComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const container = root.querySelector('.metadata-fetch-options-container') as HTMLElement;
    const topRail = container.querySelector('.top-control-rail') as HTMLElement;
    const advancedShell = root.querySelector('.advanced-options-content-shell') as HTMLElement;
    const externalScroll = root.querySelector('.options-scroll-content--external-controls') as HTMLElement;
    const embeddedRail = root.querySelector('app-metadata-advanced-fetch-options .footer-row') as HTMLElement | null;

    expect(topRail).not.toBeNull();
    expect(topRail.classList.contains('top-control-rail--solid')).toBe(true);
    expect(container.firstElementChild).toBe(topRail);
    expect(advancedShell).not.toBeNull();
    expect(externalScroll).not.toBeNull();
    expect(embeddedRail).toBeNull();
  }, 15000);

  it('can hide the internal top rail when a parent dialog renders the anchored copy', () => {
    const fixture = TestBed.createComponent(MetadataFetchOptionsComponent);
    fixture.componentInstance.showTopControlRail = false;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const topRail = root.querySelector('.metadata-fetch-options-container > .top-control-rail');

    expect(topRail).toBeNull();
  }, 15000);

  it('renders the ComicVine sequence controls inside a dedicated frame below ComicVine copy', () => {
    const fixture = TestBed.createComponent(MetadataFetchOptionsComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const comicvinePanel = root.querySelector('.comicvine-range-panel') as HTMLElement;
    const comicvineCopy = comicvinePanel.querySelector('.comicvine-range-copy') as HTMLElement;
    const comicvineFrame = comicvinePanel.querySelector('.comicvine-content-frame') as HTMLElement;

    expect(comicvineFrame).not.toBeNull();
    expect(comicvinePanel.classList.contains('metadata-section-panel')).toBe(true);
    expect(comicvinePanel.children[0]).toBe(comicvineCopy);
    expect(comicvinePanel.children[1]).toBe(comicvineFrame);
    expect(comicvineFrame.querySelector('.comicvine-range-controls')).not.toBeNull();
    expect(comicvineFrame.querySelector('.comicvine-sequence-steps')).not.toBeNull();
  }, 15000);
});
