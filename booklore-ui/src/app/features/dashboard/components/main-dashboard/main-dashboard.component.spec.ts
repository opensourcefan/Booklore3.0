import {BehaviorSubject, firstValueFrom, of} from 'rxjs';
import {TestBed} from '@angular/core/testing';
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
import {ScrollerType} from '../../models/dashboard-config.model';

describe('MainDashboardComponent', () => {
  function createComponent() {
    const bookState$ = new BehaviorSubject({
      loaded: true,
      books: [
        {id: 1, libraryId: 1, libraryName: 'Books', addedOn: '2026-04-01T00:00:00Z'},
        {id: 2, libraryId: 2, libraryName: 'Comics', addedOn: '2026-04-03T00:00:00Z'},
        {id: 3, libraryId: 2, libraryName: 'Comics', addedOn: '2026-04-02T00:00:00Z'}
      ]
    });
    const config$ = new BehaviorSubject({layoutLocked: false, scrollers: []});
    const saveConfig = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {provide: BookService, useValue: {bookState$}},
        {provide: UserService, useValue: {userState$: of({user: {permissions: {}}, loaded: true})}},
        {provide: DashboardConfigService, useValue: {config$, saveConfig}},
        {
          provide: MagicShelfService,
          useValue: {
            shelvesState$: new BehaviorSubject({shelves: []}),
            getShelf: vi.fn().mockReturnValue(of(null))
          }
        },
        {provide: BookRuleEvaluatorService, useValue: {evaluateGroup: vi.fn().mockReturnValue(true)}},
        {provide: DialogLauncherService, useValue: {openDashboardSettingsDialog: vi.fn(), openLibraryCreateDialog: vi.fn()}},
        {provide: SortService, useValue: {applySort: (books: unknown[]) => books}},
        {provide: PageTitleService, useValue: {setPageTitle: vi.fn()}},
        {
          provide: LibraryService,
          useValue: {
            libraryState$: new BehaviorSubject({
              libraries: [{id: 1, name: 'Books'}, {id: 2, name: 'Comics'}],
              loaded: true,
              error: null
            }),
            findLibraryById: vi.fn((id: number) => ({1: {id: 1, name: 'Books'}, 2: {id: 2, name: 'Comics'}}[id]))
          }
        },
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => ({
              'dashboard.main.pageTitle': 'Dashboard',
              'dashboard.scroller.discoverNew': 'Discover Something New',
              'dashboard.scroller.recentlyAdded': 'Recently Added'
            }[key] ?? key)
          }
        }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new MainDashboardComponent());
    component.ngOnInit();

    return {component, saveConfig};
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

  it('computes manual panel width using card spacing and padding', () => {
    const {component} = createComponent();
    component.workspaceWidth = 2400;

    expect(component.getScrollerPanelWidth({
      id: 'manual-width',
      type: ScrollerType.RANDOM,
      title: 'dashboard.scroller.discoverNew',
      enabled: true,
      order: 1,
      maxItems: 10,
      libraryId: null,
      columnSpan: 3
    })).toBe(516);
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