import {BehaviorSubject, firstValueFrom, of} from 'rxjs';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {DashboardSettingsComponent} from './dashboard-settings.component';
import {DashboardConfigService} from '../../services/dashboard-config.service';
import {MagicShelfService} from '../../../magic-shelf/service/magic-shelf.service';
import {LibraryService} from '../../../book/service/library.service';
import {TranslocoService} from '@jsverse/transloco';
import {MIN_ITEMS, ScrollerType} from '../../models/dashboard-config.model';

describe('DashboardSettingsComponent', () => {
  it('uses a minimum max-items value of 1', () => {
    expect(MIN_ITEMS).toBe(1);
  });

  it('adds new scrollers with dashboard library and width defaults', () => {
    const config$ = new BehaviorSubject({
      layoutLocked: false,
      scrollers: [
        {
          id: '1',
          type: ScrollerType.RANDOM,
          title: 'dashboard.scroller.discoverNew',
          enabled: true,
          order: 1,
          maxItems: 5,
          libraryId: null,
          columnSpan: null
        }
      ]
    });

    TestBed.configureTestingModule({
      providers: [
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: DashboardConfigService, useValue: {config$, saveConfig: vi.fn(), resetToDefault: vi.fn()}},
        {provide: MagicShelfService, useValue: {shelvesState$: new BehaviorSubject({shelves: []})}},
        {provide: LibraryService, useValue: {libraryState$: new BehaviorSubject({libraries: [], loaded: true, error: null})}},
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => key,
            langChanges$: of('en'),
            getActiveLang: () => 'en'
          }
        }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new DashboardSettingsComponent());
    component.ngOnInit();
    component.addScroller();

    const addedScroller = component.config.scrollers.at(-1);
    expect(addedScroller?.libraryId).toBeNull();
    expect(addedScroller?.columnSpan).toBeNull();
    expect(addedScroller?.maxItems).toBe(20);
  });

  it('saves layout lock and library-specific scroller settings', async () => {
    const saveConfig = vi.fn();
    const close = vi.fn();
    const config$ = new BehaviorSubject({
      layoutLocked: true,
      scrollers: [
        {
          id: '1',
          type: ScrollerType.RANDOM,
          title: 'dashboard.scroller.discoverNew',
          enabled: true,
          order: 1,
          maxItems: 5,
          libraryId: 3,
          columnSpan: 4
        }
      ]
    });

    TestBed.configureTestingModule({
      providers: [
        {provide: DynamicDialogRef, useValue: {close}},
        {provide: DashboardConfigService, useValue: {config$, saveConfig, resetToDefault: vi.fn()}},
        {provide: MagicShelfService, useValue: {shelvesState$: new BehaviorSubject({shelves: []})}},
        {
          provide: LibraryService,
          useValue: {
            libraryState$: new BehaviorSubject({
              libraries: [{id: 3, name: 'Comics'}],
              loaded: true,
              error: null
            })
          }
        },
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => key,
            langChanges$: of('en'),
            getActiveLang: () => 'en'
          }
        }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new DashboardSettingsComponent());
    component.ngOnInit();

    const libraryOptions = await firstValueFrom(component.libraryOptions$);
    expect(libraryOptions.map(option => option.label)).toContain('Comics');

    component.save();

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      layoutLocked: true,
      scrollers: [
        expect.objectContaining({
          libraryId: 3,
          columnSpan: 4,
          title: 'dashboard.scroller.discoverNew'
        })
      ]
    }));
    expect(close).toHaveBeenCalled();
  });
});