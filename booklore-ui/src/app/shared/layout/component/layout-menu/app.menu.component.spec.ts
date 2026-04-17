import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Observable} from 'rxjs';
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

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
      url: '/all-books',
      events: NEVER,
      parseUrl: vi.fn().mockReturnValue({queryParams: {}})
    };
    localStorageMock = {
      get: vi.fn(),
      set: vi.fn(),
      keyChanges$: NEVER
    };
    mediaTypePreferencesMock = {
      setSidebarOrder: vi.fn(),
      settings$: of({customTypes: ['CBZ', 'PHYSICAL'], sidebarOrder: []})
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: Router, useValue: routerMock},
        {provide: LibraryService, useValue: {}},
        {provide: LibraryHealthService, useValue: {}},
        {provide: ShelfService, useValue: {}},
        {provide: BookService, useValue: {bookState$: of({books: []})}},
        {provide: VersionService, useValue: {getVersion: vi.fn().mockReturnValue(of({current: '3.9.7', latest: '3.9.7'}))}},
        {provide: LibraryShelfMenuService, useValue: {}},
        {provide: DialogLauncherService, useValue: {openAcknowledgementsDialog: vi.fn()}},
        {provide: UserService, useValue: {userState$: NEVER}},
        {provide: MagicShelfService, useValue: {}},
        {provide: SeriesDataService, useValue: {allSeries$: of([])}},
        {provide: AuthorService, useValue: {getAllAuthors: vi.fn().mockReturnValue(of([])), allAuthors$: of([])}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key, getActiveLang: () => 'en', langChanges$: NEVER, load: vi.fn().mockReturnValue(of(void 0)), setActiveLang: vi.fn()}},
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
});