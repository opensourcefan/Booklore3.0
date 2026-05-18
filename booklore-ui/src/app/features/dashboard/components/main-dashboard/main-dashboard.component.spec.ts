import {Component, Input} from '@angular/core';
import {BehaviorSubject, firstValueFrom} from 'rxjs';
import {TestBed} from '@angular/core/testing';
import {map} from 'rxjs/operators';
import {describe, expect, it, vi} from 'vitest';
import {MainDashboardComponent} from './main-dashboard.component';
import {BookService} from '../../../book/service/book.service';
import {UserService} from '../../../settings/user-management/user.service';
import {DashboardConfigService} from '../../services/dashboard-config.service';
import {MagicShelfService} from '../../../magic-shelf/service/magic-shelf.service';
import {BookRuleEvaluatorService} from '../../../magic-shelf/service/book-rule-evaluator.service';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';
import {SortService} from '../../../book/service/sort.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {LibraryService} from '../../../book/service/library.service';
import {TranslocoService} from '@jsverse/transloco';
import {DashboardScrollerComponent} from '../dashboard-scroller/dashboard-scroller.component';
import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {DashboardConfig, ScrollerType} from '../../models/dashboard-config.model';

@Component({
  selector: 'app-dashboard-scroller',
  standalone: true,
  template: '<div class="dashboard-scroller-stub">{{ title }}</div>'
})
class StubDashboardScrollerComponent {
  @Input() bookListType: ScrollerType | null = null;
  @Input() title = '';
  @Input() books: unknown[] | null = null;
  @Input() isMagicShelf = false;
  @Input() useSquareCovers = false;
}

describe('MainDashboardComponent', () => {
  function createProviders(options?: {
    bookState?: {loaded: boolean; books: {id: number; libraryId: number; libraryName: string; addedOn: string}[]; error?: string | null};
    userState?: {loaded: boolean; user: {permissions: Record<string, boolean>; userSettings?: {dashboardConfig?: DashboardConfig}} | null; error?: string | null};
    libraryState?: {libraries: {id: number; name: string}[] | null; loaded: boolean; error: string | null};
    shelvesState?: {shelves: {id?: number | null; name: string; filterJson: string}[] | null; loaded: boolean; error?: string | null};
    config?: DashboardConfig;
  }) {
    const bookState$ = new BehaviorSubject(options?.bookState ?? {
      loaded: true,
      books: [
        {id: 1, libraryId: 1, libraryName: 'Books', addedOn: '2026-04-01T00:00:00Z'},
        {id: 2, libraryId: 2, libraryName: 'Comics', addedOn: '2026-04-03T00:00:00Z'},
        {id: 3, libraryId: 2, libraryName: 'Comics', addedOn: '2026-04-02T00:00:00Z'}
      ],
      error: null
    });
    const userState$ = new BehaviorSubject(options?.userState ?? {
      loaded: true,
      user: {
        permissions: {},
        userSettings: {}
      },
      error: null
    });
    const libraryState$ = new BehaviorSubject(options?.libraryState ?? {
      libraries: [{id: 1, name: 'Books'}, {id: 2, name: 'Comics'}],
      loaded: true,
      error: null
    });
    const shelvesState$ = new BehaviorSubject(options?.shelvesState ?? {
      shelves: [],
      loaded: true,
      error: null
    });
    const config$ = new BehaviorSubject(options?.config ?? {layoutLocked: false, scrollers: []});
    const saveConfig = vi.fn();

    return {bookState$, userState$, libraryState$, shelvesState$, config$, saveConfig};
  }

  function configureTestingModule(providers: ReturnType<typeof createProviders>, renderTemplate = false) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: renderTemplate
        ? [MainDashboardComponent, getTranslocoModule({
            langs: {
              en: {
                dashboard: {
                  main: {
                    pageTitle: 'Dashboard'
                  },
                  scroller: {
                    discoverNew: 'Discover Something New',
                    recentlyAdded: 'Recently Added'
                  }
                }
              }
            }
          })]
        : [getTranslocoModule({
            langs: {
              en: {
                dashboard: {
                  main: {
                    pageTitle: 'Dashboard'
                  },
                  scroller: {
                    discoverNew: 'Discover Something New',
                    recentlyAdded: 'Recently Added'
                  }
                }
              }
            }
          })],
      providers: [
        {provide: BookService, useValue: {bookState$: providers.bookState$}},
        {provide: UserService, useValue: {userState$: providers.userState$, getCurrentUser: vi.fn().mockReturnValue({id: 7})}},
        {provide: DashboardConfigService, useValue: {config$: providers.config$, saveConfig: providers.saveConfig}},
        {
          provide: MagicShelfService,
          useValue: {
            shelvesState$: providers.shelvesState$,
            getShelf: vi.fn().mockImplementation((id: number) =>
              providers.shelvesState$.pipe(
                map(state => state.shelves?.find(shelf => shelf.id === id))
              )
            )
          }
        },
        {provide: BookRuleEvaluatorService, useValue: {evaluateGroup: vi.fn().mockReturnValue(true)}},
        {provide: DialogLauncherService, useValue: {openDashboardSettingsDialog: vi.fn(), openLibraryCreateDialog: vi.fn()}},
        {provide: SortService, useValue: {applySort: (books: unknown[]) => books}},
        {provide: PageTitleService, useValue: {setPageTitle: vi.fn()}},
        {
          provide: LibraryService,
          useValue: {
            libraryState$: providers.libraryState$,
            findLibraryById: vi.fn((id: number) => ({1: {id: 1, name: 'Books'}, 2: {id: 2, name: 'Comics'}}[id]))
          }
        },
        ...(!renderTemplate ? [{
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => ({
              'dashboard.main.pageTitle': 'Dashboard',
              'dashboard.scroller.discoverNew': 'Discover Something New',
              'dashboard.scroller.recentlyAdded': 'Recently Added'
            }[key] ?? key)
          }
        }] : [])
      ]
    });

    if (renderTemplate) {
      TestBed.overrideComponent(MainDashboardComponent, {
        remove: {imports: [DashboardScrollerComponent]},
        add: {imports: [StubDashboardScrollerComponent]}
      });
    }

    return providers;
  }

  function createComponent(options?: Parameters<typeof createProviders>[0]) {
    const providers = configureTestingModule(createProviders(options));
    const component = TestBed.runInInjectionContext(() => new MainDashboardComponent());
    component.ngOnInit();

    return {...providers, component};
  }

  function createRenderedComponent(options?: Parameters<typeof createProviders>[0]) {
    const providers = configureTestingModule(createProviders(options), true);
    const fixture = TestBed.createComponent(MainDashboardComponent);
    fixture.detectChanges();

    return {...providers, fixture, component: fixture.componentInstance};
  }

  it('appends the selected library name to dashboard panel titles', () => {
    const {component} = createComponent();

    const title = component.getScrollerDisplayTitle({
      id: '1',
      type: ScrollerType.RANDOM,
      title: 'dashboard.scroller.discoverNew',
      enabled: true,
      order: 1,
      maxItems: 5,
      libraryId: 2,
      columnSpan: null
    });

    expect(title).toBe('Discover Something New: Comics');
  });

  it('filters panel books by the configured library', async () => {
    const {component} = createComponent();

    const books = await firstValueFrom(component.getBooksForScroller({
      id: 'library-added',
      type: ScrollerType.LATEST_ADDED,
      title: 'dashboard.scroller.recentlyAdded',
      enabled: true,
      order: 1,
      maxItems: 5,
      libraryId: 2,
      columnSpan: null
    }));

    expect(books.map(book => book.id)).toEqual([2, 3]);
  });

  it('keeps the loading state visible until book, user, and library state are ready', () => {
    const {fixture, userState$, libraryState$} = createRenderedComponent({
      userState: {
        loaded: false,
        user: {
          permissions: {admin: true, canManageLibrary: true},
          userSettings: {}
        },
        error: null
      },
      libraryState: {libraries: null, loaded: false, error: null}
    });

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.loading-state')).not.toBeNull();
    expect(root.querySelector('.dashboard')).toBeNull();

    userState$.next({
      loaded: true,
      user: {
        permissions: {admin: true, canManageLibrary: true},
        userSettings: {}
      },
      error: null
    });
    fixture.detectChanges();

    expect(root.querySelector('.loading-state')).not.toBeNull();

    libraryState$.next({
      libraries: [],
      loaded: true,
      error: null
    });
    fixture.detectChanges();

    expect(root.querySelector('.loading-state')).toBeNull();
    expect(root.querySelector('.dashboard')).not.toBeNull();
  });

  it('waits for magic shelf data when an enabled magic shelf scroller is configured', async () => {
    const {component, shelvesState$} = createComponent({
      config: {
        layoutLocked: false,
        scrollers: [
          {id: 'magic', type: ScrollerType.MAGIC_SHELF, title: 'My Shelf', enabled: true, order: 1, maxItems: 5, magicShelfId: 9, libraryId: null, columnSpan: null}
        ]
      },
      shelvesState: {shelves: null, loaded: false, error: null}
    });

    expect(await firstValueFrom(component.viewModel$)).toEqual(expect.objectContaining({ready: false}));

    shelvesState$.next({
      shelves: [{id: 9, name: 'My Shelf', filterJson: '{"operator":"AND","rules":[]}' }],
      loaded: true,
      error: null
    });

    expect(await firstValueFrom(component.viewModel$)).toEqual(expect.objectContaining({ready: true}));
  });

  it('keeps cached scroller observables when only presentation fields change', () => {
    const {component, config$} = createComponent({
      config: {
        layoutLocked: false,
        scrollers: [
          {id: '1', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null}
        ]
      }
    });

    const initialConfig = {id: '1', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null};
    const updatedConfig = {...initialConfig, title: 'Updated title', columnSpan: 3};
    const first$ = component.getBooksForScroller(initialConfig);

    config$.next({layoutLocked: true, scrollers: [updatedConfig]});

    expect(component.getBooksForScroller(updatedConfig)).toBe(first$);
  });

  it('rebuilds cached scroller observables when book-affecting config changes', async () => {
    const {component, config$} = createComponent({
      config: {
        layoutLocked: false,
        scrollers: [
          {id: '1', type: ScrollerType.LATEST_ADDED, title: 'dashboard.scroller.recentlyAdded', enabled: true, order: 1, maxItems: 5, libraryId: 1, columnSpan: null}
        ]
      }
    });

    const initialConfig = {id: '1', type: ScrollerType.LATEST_ADDED, title: 'dashboard.scroller.recentlyAdded', enabled: true, order: 1, maxItems: 5, libraryId: 1, columnSpan: null};
    const updatedConfig = {...initialConfig, libraryId: 2};
    const first$ = component.getBooksForScroller(initialConfig);

    expect((await firstValueFrom(first$)).map(book => book.id)).toEqual([1]);

    config$.next({layoutLocked: false, scrollers: [updatedConfig]});

    const second$ = component.getBooksForScroller(updatedConfig);

    expect(second$).not.toBe(first$);
    expect((await firstValueFrom(second$)).map(book => book.id)).toEqual([2, 3]);
  });

  it('does not drop non-magic scroller caches when shelves state changes', () => {
    const {component, shelvesState$} = createComponent({
      config: {
        layoutLocked: false,
        scrollers: [
          {id: '1', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null}
        ]
      },
      shelvesState: {shelves: null, loaded: false, error: null}
    });

    const config = {id: '1', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null};
    const first$ = component.getBooksForScroller(config);

    shelvesState$.next({
      shelves: [{id: 11, name: 'Shelf', filterJson: '{"operator":"AND","rules":[]}' }],
      loaded: true,
      error: null
    });

    expect(component.getBooksForScroller(config)).toBe(first$);
  });

  it('uses explicit width selection as the dashboard grid span', () => {
    const {component} = createComponent();
    component.workspaceWidth = 2400;

    const config = {
      id: 'manual-width',
      type: ScrollerType.RANDOM,
      title: 'dashboard.scroller.discoverNew',
      enabled: true,
      order: 1,
      maxItems: 10,
      libraryId: null,
      columnSpan: 3
    };

    expect(component.getScrollerColumnSpan(config)).toBe(3);
    expect(component.getScrollerPanelWidth(config)).toBeCloseTo(585, 0);
  });

  it('keeps manual width independent from max items so overflow stays inside the scroller', () => {
    const {component} = createComponent();
    component.workspaceWidth = 2400;

    const narrowConfig = {
      id: 'manual-width-5',
      type: ScrollerType.RANDOM,
      title: 'dashboard.scroller.discoverNew',
      enabled: true,
      order: 1,
      maxItems: 5,
      libraryId: null,
      columnSpan: 5
    };

    const wideDataConfig = {
      ...narrowConfig,
      maxItems: 10
    };

    expect(component.getScrollerColumnSpan(narrowConfig)).toBe(5);
    expect(component.getScrollerColumnSpan(wideDataConfig)).toBe(5);
    expect(component.getScrollerPanelWidth(narrowConfig)).toBeCloseTo(component.getScrollerPanelWidth(wideDataConfig), 5);
  });

  it('computes auto width from content and converts it to a grid span', () => {
    const {component} = createComponent();
    component.workspaceWidth = 2400;

    const config = {
      id: 'auto-width',
      type: ScrollerType.RANDOM,
      title: 'dashboard.scroller.discoverNew',
      enabled: true,
      order: 1,
      maxItems: 3,
      libraryId: null,
      columnSpan: null
    };

    expect(component.getScrollerColumnSpan(config)).toBe(3);
    expect(component.getScrollerPanelWidth(config)).toBeCloseTo(585, 0);
  });

  it('persists grid reorder changes when the layout is unlocked', () => {
    const {component, saveConfig} = createComponent();
    const config = {
      layoutLocked: false,
      scrollers: [
        {id: '1', type: ScrollerType.LATEST_ADDED, title: 'dashboard.scroller.recentlyAdded', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null},
        {id: '2', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 2, maxItems: 5, libraryId: 2, columnSpan: null}
      ]
    };

    component.onDashboardDrop({previousIndex: 0, currentIndex: 1} as never, config);

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      scrollers: [
        expect.objectContaining({id: '2', order: 1}),
        expect.objectContaining({id: '1', order: 2})
      ]
    }));
  });

  it('ignores drag reorder events when the layout is locked', () => {
    const {component, saveConfig} = createComponent();
    const config = {
      layoutLocked: true,
      scrollers: [
        {id: '1', type: ScrollerType.LATEST_ADDED, title: 'dashboard.scroller.recentlyAdded', enabled: true, order: 1, maxItems: 5, libraryId: null, columnSpan: null},
        {id: '2', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 2, maxItems: 5, libraryId: 2, columnSpan: null}
      ]
    };

    component.onDashboardDrop({previousIndex: 0, currentIndex: 1} as never, config);

    expect(saveConfig).not.toHaveBeenCalled();
  });
});