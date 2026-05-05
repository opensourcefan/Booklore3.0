import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {NEVER, of} from 'rxjs';
import {MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {AppMenuComponent} from './app.menu.component';
import {AppMenuItem} from './app.menuitem.component';
import {LibraryService} from '../../../../features/book/service/library.service';
import {LibraryHealthService} from '../../../../features/book/service/library-health.service';
import {ShelfService} from '../../../../features/book/service/shelf.service';
import {BookService} from '../../../../features/book/service/book.service';
import {VersionService} from '../../../service/version.service';
import {LibraryShelfMenuService} from '../../../../features/book/service/library-shelf-menu.service';
import {DialogLauncherService} from '../../../services/dialog-launcher.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {MagicShelfService} from '../../../../features/magic-shelf/service/magic-shelf.service';
import {SeriesDataService} from '../../../../features/series-browser/service/series-data.service';
import {AuthorService} from '../../../../features/author-browser/service/author.service';
import {LocalStorageService} from '../../../service/local-storage.service';
import {BookDialogHelperService} from '../../../../features/book/components/book-browser/book-dialog-helper.service';
import {MediaTypePreferencesService} from '../../../../features/book/service/media-type-preferences.service';

describe('AppMenuComponent reorder mode', () => {
  let component: AppMenuComponent;
  let routerMock: {navigate: ReturnType<typeof vi.fn>; url: string; events: typeof NEVER; parseUrl: ReturnType<typeof vi.fn>};
  let localStorageMock: {get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; keyChanges$: typeof NEVER};
  let mediaTypePreferencesMock: {setSidebarOrder: ReturnType<typeof vi.fn>; settings$: Observable<{customTypes: string[]; sidebarOrder: string[]}>};
  let versionServiceMock: {getVersion: ReturnType<typeof vi.fn>};
  let libraryServiceMock: {libraryState$: Observable<{libraries: never[]}>; getBookCount: ReturnType<typeof vi.fn>};
  let magicShelfServiceMock: {shelvesState$: Observable<{shelves: never[]}>; getBookCount: ReturnType<typeof vi.fn>};
  let shelfServiceMock: {shelfState$: Observable<{shelves: never[]}>; getUnshelvedBookCount: ReturnType<typeof vi.fn>; getBookCount: ReturnType<typeof vi.fn>};
  let langChanges$: BehaviorSubject<string>;
  let keyChanges$: Subject<string>;

  beforeEach(() => {
    langChanges$ = new BehaviorSubject<string>('en');
    keyChanges$ = new Subject<string>();
    routerMock = {
      navigate: vi.fn(),
      url: '/all-books',
      events: NEVER,
      parseUrl: vi.fn().mockReturnValue({queryParams: {}})
    };
    localStorageMock = {
      get: vi.fn(),
      set: vi.fn(),
      keyChanges$: keyChanges$.asObservable() as typeof NEVER
    };
    mediaTypePreferencesMock = {
      setSidebarOrder: vi.fn(),
      settings$: of({customTypes: ['CBZ', 'PHYSICAL'], sidebarOrder: []})
    };
    versionServiceMock = {
      getVersion: vi.fn().mockReturnValue(of({current: '3.9.7', latest: '3.9.7'}))
    };
    libraryServiceMock = {
      libraryState$: of({libraries: []}),
      getBookCount: vi.fn(() => of(0))
    };
    magicShelfServiceMock = {
      shelvesState$: of({shelves: []}),
      getBookCount: vi.fn(() => of(0))
    };
    shelfServiceMock = {
      shelfState$: of({shelves: []}),
      getUnshelvedBookCount: vi.fn(() => of(7)),
      getBookCount: vi.fn(() => of(0))
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: Router, useValue: routerMock},
        {provide: LibraryService, useValue: libraryServiceMock},
        {provide: LibraryHealthService, useValue: {}},
        {provide: ShelfService, useValue: shelfServiceMock},
        {provide: BookService, useValue: {bookState$: of({books: []})}},
        {provide: VersionService, useValue: versionServiceMock},
        {provide: LibraryShelfMenuService, useValue: {}},
        {provide: DialogLauncherService, useValue: {openAcknowledgementsDialog: vi.fn()}},
        {provide: UserService, useValue: {userState$: NEVER}},
        {provide: MagicShelfService, useValue: magicShelfServiceMock},
        {provide: SeriesDataService, useValue: {allSeries$: of([])}},
        {provide: AuthorService, useValue: {getAllAuthors: vi.fn().mockReturnValue(of([])), allAuthors$: of([])}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key, getActiveLang: () => 'en', langChanges$: langChanges$.asObservable(), load: vi.fn().mockReturnValue(of(void 0)), setActiveLang: vi.fn()}},
        {provide: LocalStorageService, useValue: localStorageMock},
        {provide: BookDialogHelperService, useValue: {openBookTypeCreatorDialog: vi.fn().mockReturnValue({onClose: of(false)})}},
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: MediaTypePreferencesService, useValue: mediaTypePreferencesMock}
      ]
    });

    component = TestBed.runInInjectionContext(() => new AppMenuComponent());
    component.sectionOrder = ['home', 'library', 'shelf'];
    component.sectionVisibility = {home: true, library: true, shelf: false, magicShelf: false, bookType: false};
  });

  it('blocks section reordering until reorder mode is enabled', () => {
    component.onSectionDrop({
      previousIndex: 0,
      currentIndex: 1,
      container: {data: ['home', 'library']}
    } as never);

    expect(component.sectionOrder).toEqual(['home', 'library', 'shelf']);
    expect(localStorageMock.set).not.toHaveBeenCalled();

    component.isReorderMode = true;
    component.onSectionDrop({
      previousIndex: 0,
      currentIndex: 1,
      container: {data: ['home', 'library']}
    } as never);

    expect(component.sectionOrder).toEqual(['library', 'home', 'shelf']);
    expect(localStorageMock.set).toHaveBeenCalledWith('sidebarSectionOrder', ['library', 'home', 'shelf']);
  });

  it('blocks media type navigation while reorder mode is enabled', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as Event;

    component.isReorderMode = true;
    component.selectBookTypeFilter('CBZ', event);

    expect(routerMock.navigate).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('builds media type rows through the shared menu item model with reorder persistence', async () => {
    component.ngOnInit();

    const menu = await new Promise<AppMenuItem[]>((resolve) => {
      component.bookTypeMenu$?.subscribe(resolve);
    });

    expect(menu).toHaveLength(1);
    expect(menu[0].type).toBe('mediaType');
    expect(menu[0].items?.map(item => item.label)).not.toContain('PHYSICAL');
    expect(menu[0].items?.[0].type).toBe('MediaType');
    expect(menu[0].items?.[0].menu?.length).toBeGreaterThan(0);
    expect(menu[0].items?.[0].showBookCount).toBeUndefined();

    menu[0].onItemsReorder?.([
      {label: 'PDF'} as AppMenuItem,
      {label: 'CBZ'} as AppMenuItem
    ]);

    expect(mediaTypePreferencesMock.setSidebarOrder).toHaveBeenCalledWith(['PDF', 'CBZ']);
  });

  it('does not treat physical books without file types as media type entries', () => {
    const navigationType = (component as unknown as {
      getNavigationMediaType: (book: { fileType?: string | null; isPhysical?: boolean }) => string | null;
    }).getNavigationMediaType({ isPhysical: true, fileType: null });

    expect(navigationType).toBeNull();
  });

  it('marks the Not Shelfed row to always show its count badge', async () => {
    (component as unknown as { initMenus: () => void }).initMenus();

    const menu = await new Promise<AppMenuItem[]>((resolve) => {
      component.shelfMenu$?.subscribe(resolve);
    });

    expect(menu).toHaveLength(1);
    expect(menu[0].items?.[0].routerLink).toEqual(['/not-shelfed']);
    expect(menu[0].items?.[0].showBookCount).toBe(true);
  });

  it('adds the dashboard settings end action to the dashboard row', async () => {
    component.ngOnInit();

    const menu = await new Promise<AppMenuItem[]>((resolve) => {
      component.homeMenu$?.subscribe(resolve);
    });

    const dashboardItem = menu[0].items?.find(item => item.routerLink?.[0] === '/dashboard');

    expect(dashboardItem?.endActionIcon).toBe('pi pi-cog');
    expect(dashboardItem?.endActionClass).toBe('dashboard-row-end-action');
    expect(dashboardItem?.endActionCommand).toBeTypeOf('function');
  });

  it('reuses cached stable tag when latest tag is temporarily unavailable', () => {
    localStorageMock.get.mockImplementation((key: string) => {
      if (key === 'sidebarLatestStableVersion') {
        return 'v3.11.1';
      }
      return null;
    });
    versionServiceMock.getVersion.mockReturnValue(of({current: 'develop-abc123', latest: 'unknown'}));

    component.ngOnInit();

    expect(component.versionInfo).toEqual({current: 'develop-abc123', latest: 'v3.11.1'});
  });

  it('caches stable latest tags for future fallbacks', () => {
    versionServiceMock.getVersion.mockReturnValue(of({current: 'develop-abc123', latest: 'v3.11.2'}));

    component.ngOnInit();

    expect(localStorageMock.set).toHaveBeenCalledWith('sidebarLatestStableVersion', 'v3.11.2');
  });

  it('stops reacting to long-lived streams after destroy', () => {
    localStorageMock.get.mockImplementation((key: string) => {
      if (key === 'sidebarSectionOrder') {
        return ['library', 'home', 'shelf'];
      }
      return null;
    });

    component.ngOnInit();

    langChanges$.next('fr');
    keyChanges$.next('sidebarSectionOrder');

    expect(component.activeLang).toBe('fr');
    expect(component.sectionOrder).toEqual(['library', 'home', 'shelf', 'magicShelf', 'bookType']);

    component.ngOnDestroy();

    localStorageMock.get.mockImplementation((key: string) => {
      if (key === 'sidebarSectionOrder') {
        return ['shelf', 'home', 'library'];
      }
      return null;
    });

    langChanges$.next('de');
    keyChanges$.next('sidebarSectionOrder');

    expect(component.activeLang).toBe('fr');
    expect(component.sectionOrder).toEqual(['library', 'home', 'shelf', 'magicShelf', 'bookType']);
  });
});