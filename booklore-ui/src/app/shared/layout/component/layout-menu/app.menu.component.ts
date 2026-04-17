import {Component, inject, OnInit} from '@angular/core';
import {AppMenuitemComponent, AppMenuItem} from './app.menuitem.component';
import {AsyncPipe} from '@angular/common';
import {MenuModule} from 'primeng/menu';
import {LibraryService} from '../../../../features/book/service/library.service';
import {LibraryHealthService} from '../../../../features/book/service/library-health.service';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {catchError, filter, map} from 'rxjs/operators';
import {ShelfService} from '../../../../features/book/service/shelf.service';
import {BookService} from '../../../../features/book/service/book.service';
import {LibraryShelfMenuService} from '../../../../features/book/service/library-shelf-menu.service';
import {AppVersion, VersionService} from '../../../service/version.service';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {MagicShelfService, MagicShelfState} from '../../../../features/magic-shelf/service/magic-shelf.service';
import {SeriesDataService} from '../../../../features/series-browser/service/series-data.service';
import {AuthorService} from '../../../../features/author-browser/service/author.service';
import {MenuItem, MessageService} from 'primeng/api';
import {DialogLauncherService} from '../../../services/dialog-launcher.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Menu} from 'primeng/menu';
import {Router} from '@angular/router';
import {TooltipModule} from 'primeng/tooltip';
import {Popover} from 'primeng/popover';
import {CheckboxModule} from 'primeng/checkbox';
import {FormsModule} from '@angular/forms';
import {AVAILABLE_LANGS, LANG_LABELS} from '../../../../core/config/transloco-loader';
import {LANG_STORAGE_KEY} from '../../../../core/config/language-initializer';
import {LocalStorageService} from '../../../service/local-storage.service';
import {CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {BookDialogHelperService} from '../../../../features/book/components/book-browser/book-dialog-helper.service';
import {MediaTypePreferencesService} from '../../../../features/book/service/media-type-preferences.service';

type HomeItemVisibilityKey = 'dashboard' | 'allBooks' | 'physicalBooks' | 'series' | 'authors' | 'notebook';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [AppMenuitemComponent, MenuModule, AsyncPipe, TranslocoDirective, Menu, TooltipModule, CdkDropList, CdkDrag, Popover, CheckboxModule, FormsModule],
  templateUrl: './app.menu.component.html',
  styleUrl: './app.menu.component.scss',
})
export class AppMenuComponent implements OnInit {
  libraryMenu$: Observable<AppMenuItem[]> | undefined;
  shelfMenu$: Observable<AppMenuItem[]> | undefined;
  homeMenu$: Observable<AppMenuItem[]> | undefined;
  magicShelfMenu$: Observable<AppMenuItem[]> | undefined;
  bookTypeMenu$: Observable<AppMenuItem[]> | undefined;
  isReorderMode = false;
  activeBookTypeFilter: string | null = null;

  versionInfo: AppVersion | null = null;
  dynamicDialogRef: DynamicDialogRef | undefined | null;

  private libraryService = inject(LibraryService);
  private libraryHealthService = inject(LibraryHealthService);
  private shelfService = inject(ShelfService);
  private bookService = inject(BookService);
  private versionService = inject(VersionService);
  private libraryShelfMenuService = inject(LibraryShelfMenuService);
  private dialogLauncherService = inject(DialogLauncherService);
  private userService = inject(UserService);
  private magicShelfService = inject(MagicShelfService);
  private seriesDataService = inject(SeriesDataService);
  private authorService = inject(AuthorService);
  private t = inject(TranslocoService);
  private localStorageService = inject(LocalStorageService);
  private bookDialogHelperService = inject(BookDialogHelperService);
  private messageService = inject(MessageService);
  private mediaTypePreferences = inject(MediaTypePreferencesService);

  activeLang = '';
  langMenuItems: MenuItem[] = [];
  private router = inject(Router);

  librarySortField: 'name' | 'id' = 'name';
  librarySortOrder: 'asc' | 'desc' = 'desc';
  shelfSortField: 'name' | 'id' = 'name';
  shelfSortOrder: 'asc' | 'desc' = 'asc';
  magicShelfSortField: 'name' | 'id' = 'name';
  magicShelfSortOrder: 'asc' | 'desc' = 'asc';
  sectionOrder: string[] = ['home', 'library', 'shelf', 'magicShelf', 'bookType'];
  sectionVisibility: Record<string, boolean> = {
    home: true,
    library: true,
    shelf: true,
    magicShelf: true,
    bookType: false,
  };
  homeItemVisibility: Record<HomeItemVisibilityKey, boolean> = {
    dashboard: true,
    allBooks: true,
    physicalBooks: true,
    series: true,
    authors: true,
    notebook: true,
  };

  private readonly sectionOrderKey = 'sidebarSectionOrder';
  private readonly sectionVisibilityKey = 'sidebarSectionVisibility';
  private readonly nestedOrderPrefix = 'sidebarNestedOrder_';
  private readonly homeItemVisibilitySubject = new BehaviorSubject<Record<HomeItemVisibilityKey, boolean>>(this.homeItemVisibility);
  private initialSectionVisibilityFromStorage: Record<string, boolean> | null = null;
  private sectionVisibilityUserId: number | null = null;
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;
  private suppressTapUntil = 0;

  readonly sectionOptions: {key: string; label: string}[] = [
    {key: 'home', label: 'layout.menu.home'},
    {key: 'library', label: 'layout.menu.libraries'},
    {key: 'shelf', label: 'layout.menu.shelves'},
    {key: 'magicShelf', label: 'layout.menu.magicShelves'},
    {key: 'bookType', label: 'layout.menu.mediaType'},
  ];
  readonly homeItemOptions: {key: HomeItemVisibilityKey; label: string}[] = [
    {key: 'dashboard', label: 'layout.menu.dashboard'},
    {key: 'allBooks', label: 'layout.menu.allBooks'},
    {key: 'physicalBooks', label: 'layout.menu.physicalBooks'},
    {key: 'series', label: 'layout.menu.series'},
    {key: 'authors', label: 'layout.menu.authors'},
    {key: 'notebook', label: 'layout.menu.notebook'},
  ];

  get visibleSectionOrder(): string[] {
    return this.sectionOrder.filter(section => this.sectionVisibility[section] !== false);
  }

  ngOnInit(): void {
    const savedSectionOrder = this.localStorageService.get<string[]>(this.sectionOrderKey);
    if (savedSectionOrder?.length) {
      this.sectionOrder = this.normalizeSectionOrder(savedSectionOrder);
    } else {
      this.localStorageService.set(this.sectionOrderKey, this.sectionOrder);
    }

    const savedSectionVisibility = this.localStorageService.get<Record<string, boolean>>(this.sectionVisibilityKey);
    this.initialSectionVisibilityFromStorage = savedSectionVisibility ?? null;
    this.applySidebarVisibility(savedSectionVisibility);
    if (!savedSectionVisibility) {
      this.localStorageService.set(this.sectionVisibilityKey, this.buildSidebarVisibilitySettings());
    }

    this.activeLang = this.t.getActiveLang();
    this.buildLangMenu();
    this.t.langChanges$.subscribe((lang: string) => { this.activeLang = lang; this.buildLangMenu(); });
    this.localStorageService.keyChanges$.subscribe((key: string) => {
      if (key === this.sectionOrderKey) {
        const updatedOrder = this.localStorageService.get<string[]>(this.sectionOrderKey);
        if (updatedOrder?.length) {
          this.sectionOrder = this.normalizeSectionOrder(updatedOrder);
        }
      }
      if (key === this.sectionVisibilityKey) {
        const updatedVisibility = this.localStorageService.get<Record<string, boolean>>(this.sectionVisibilityKey);
        this.applySidebarVisibility(updatedVisibility);
      }
    });

    this.syncActiveBookTypeFilterFromUrl();
    this.router.events.subscribe(() => this.syncActiveBookTypeFilterFromUrl());

    this.versionService.getVersion().pipe(
      catchError(() => of({current: 'unknown', latest: 'unknown'}))
    ).subscribe((data) => {
      this.versionInfo = data;
    });

    this.authorService.getAllAuthors().subscribe();

    this.userService.userState$.pipe(
      filter(userState => !!userState?.user && userState.loaded))
      .subscribe(userState => {
        if (this.sectionVisibilityUserId !== userState.user?.id) {
          this.sectionVisibilityUserId = userState.user?.id ?? null;
          this.initializeSectionVisibilityForUser(userState.user?.id ?? null, userState.user?.userSettings.sidebarSectionVisibility);
        }

        if (userState.user?.userSettings.sidebarLibrarySorting) {
          this.librarySortField = this.validateSortField(userState.user.userSettings.sidebarLibrarySorting.field);
          this.librarySortOrder = this.validateSortOrder(userState.user.userSettings.sidebarLibrarySorting.order);
        }
        if (userState.user?.userSettings.sidebarShelfSorting) {
          this.shelfSortField = this.validateSortField(userState.user.userSettings.sidebarShelfSorting.field);
          this.shelfSortOrder = this.validateSortOrder(userState.user.userSettings.sidebarShelfSorting.order);
        }
        if (userState.user?.userSettings.sidebarMagicShelfSorting) {
          this.magicShelfSortField = this.validateSortField(userState.user.userSettings.sidebarMagicShelfSorting.field);
          this.magicShelfSortOrder = this.validateSortOrder(userState.user.userSettings.sidebarMagicShelfSorting.order);
        }
        this.initMenus();
      });

    this.homeMenu$ = combineLatest([this.bookService.bookState$, this.t.langChanges$, this.homeItemVisibilitySubject]).pipe(
      map(([bookState]) => {
        const items: AppMenuItem[] = [
          {
            label: this.t.translate('layout.menu.dashboard'),
            visibilityKey: 'dashboard',
            icon: 'pi pi-fw pi-home',
            routerLink: ['/dashboard'],
          },
          {
            label: this.t.translate('layout.menu.allBooks'),
            visibilityKey: 'allBooks',
            type: 'All Books',
            icon: 'pi pi-fw pi-book',
            routerLink: ['/all-books'],
            bookCount$: of(bookState.books ? bookState.books.length : 0),
          },
          {
            label: this.t.translate('layout.menu.physicalBooks'),
            visibilityKey: 'physicalBooks',
            type: 'Physical Books',
            icon: 'pi pi-fw pi-box',
            routerLink: ['/physical-books'],
            bookCount$: of((bookState.books ?? []).filter(book => book.isPhysical).length),
          },
          {
            label: this.t.translate('layout.menu.series'),
            visibilityKey: 'series',
            type: 'Series',
            icon: 'pi pi-fw pi-objects-column',
            routerLink: ['/series'],
            bookCount$: this.seriesDataService.allSeries$.pipe(map(series => series.length)),
          },
          {
            label: this.t.translate('layout.menu.authors'),
            visibilityKey: 'authors',
            type: 'Authors',
            icon: 'pi pi-fw pi-users',
            routerLink: ['/authors'],
            bookCount$: this.authorService.allAuthors$.pipe(map(authors => authors?.length ?? 0)),
          },
          {
            label: this.t.translate('layout.menu.notebook'),
            visibilityKey: 'notebook',
            icon: 'pi pi-fw pi-pencil',
            routerLink: ['/notebook'],
          }
        ];

        return [
          {
            label: this.t.translate('layout.menu.home'),
            items: items.filter(item => !item.visibilityKey || this.isHomeItemVisible(item.visibilityKey as HomeItemVisibilityKey)),
          },
        ];
      }),
      map(menuItems => this.applyNestedItemOrder('home', menuItems))
    );

    this.bookTypeMenu$ = combineLatest([this.bookService.bookState$, this.mediaTypePreferences.settings$]).pipe(
      map(([bookState, mediaTypeSettings]) => {
        const counts = new Map<string, number>();
        for (const book of bookState.books ?? []) {
          const type = this.getNavigationMediaType(book);
          if (!type) {
            continue;
          }
          counts.set(type, (counts.get(type) ?? 0) + 1);
        }

        for (const savedType of mediaTypeSettings.customTypes) {
          const normalizedSavedType = savedType.trim();
          if (!normalizedSavedType || normalizedSavedType.toUpperCase() === 'PHYSICAL') {
            continue;
          }

          if (!counts.has(normalizedSavedType)) {
            counts.set(normalizedSavedType, 0);
          }
        }

        const sortedBookTypes = [...counts.entries()]
          .map(([label, count]) => ({label, count}))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        const orderedBookTypes = this.applyBookTypeOrder(sortedBookTypes, mediaTypeSettings.sidebarOrder);
        return [
          {
            label: this.t.translate('layout.menu.mediaType'),
            type: 'mediaType',
            hasDropDown: true,
            hasCreate: true,
            onCreate: () => this.openMediaTypeCreatorDialog(),
            onItemsReorder: (items: AppMenuItem[]) => this.mediaTypePreferences.setSidebarOrder(items.map(item => item.label ?? '')),
            items: orderedBookTypes.map(entry => this.createMediaTypeMenuItem(entry.label, entry.count)),
          }
        ];
      })
    );
  }

  onSectionDrop(event: CdkDragDrop<string[]>): void {
    if (!this.isReorderMode) {
      return;
    }

    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const visibleSections = [...this.visibleSectionOrder];
    moveItemInArray(visibleSections, event.previousIndex, event.currentIndex);

    let visibleIndex = 0;
    this.sectionOrder = this.sectionOrder.map(section => {
      if (this.sectionVisibility[section] !== false) {
        return visibleSections[visibleIndex++];
      }
      return section;
    });

    this.localStorageService.set(this.sectionOrderKey, this.sectionOrder);
  }

  toggleReorderMode(): void {
    this.isReorderMode = !this.isReorderMode;
  }

  getSectionHeading(section: string): string {
    switch (section) {
      case 'home':
        return this.t.translate('layout.menu.home');
      case 'library':
        return this.t.translate('layout.menu.libraries');
      case 'shelf':
        return this.t.translate('layout.menu.shelves');
      case 'magicShelf':
        return this.t.translate('layout.menu.magicShelves');
      case 'bookType':
        return this.t.translate('layout.menu.mediaType');
      default:
        return section;
    }
  }

  selectBookTypeFilter(bookType: string, event?: Event): void {
    if (this.isReorderMode) {
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }

    if (this.shouldSuppressTap()) {
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }

    this.router.navigate(['/all-books'], {
      queryParams: {
        filter: `customMediaType:${encodeURIComponent(bookType)}`,
      }
    });
  }

  isBookTypeFilterActive(bookType: string): boolean {
    return this.activeBookTypeFilter === bookType;
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    if (touch && this.touchStartX != null && this.touchStartY != null) {
      const deltaX = Math.abs(touch.clientX - this.touchStartX);
      const deltaY = Math.abs(touch.clientY - this.touchStartY);
      if (deltaX > 8 || deltaY > 8) {
        this.suppressTapUntil = Date.now() + 250;
      }
    }
    this.touchStartX = null;
    this.touchStartY = null;
  }

  onTouchCancel(): void {
    this.touchStartX = null;
    this.touchStartY = null;
    this.suppressTapUntil = Date.now() + 250;
  }

  openMediaTypeCreatorDialog(): void {
    if (this.isReorderMode) {
      return;
    }

    const dialogRef = this.bookDialogHelperService.openBookTypeCreatorDialog();
    dialogRef.onClose.subscribe((result: {created?: boolean; type?: string} | boolean) => {
      if (!result) {
        return;
      }
      const created = typeof result === 'boolean' ? result : !!result.created;
      if (created) {
        const type = typeof result === 'object' ? result.type : undefined;
        if (type) {
          this.selectBookTypeFilter(type);
        }
      }
    });
  }

  getMediaTypeMenuItems(mediaType: string): AppMenuItem[] {
    return [
      {
        label: 'Edit Media Type',
        icon: 'pi pi-pencil',
        command: () => this.editMediaType(mediaType)
      },
      {
        label: 'Delete Media Type',
        icon: 'pi pi-trash',
        command: () => this.deleteMediaType(mediaType)
      }
    ];
  }

  toggleSectionVisibility(section: string): void {
    const currentlyVisible = this.sectionVisibility[section] !== false;
    const visibleCount = this.visibleSectionOrder.length;

    if (currentlyVisible && visibleCount <= 1) {
      return;
    }

    this.sectionVisibility = {
      ...this.sectionVisibility,
      [section]: !currentlyVisible,
    };

    this.localStorageService.set(this.sectionVisibilityKey, this.buildSidebarVisibilitySettings());
    this.persistSectionVisibility();
  }

  isSectionVisible(section: string): boolean {
    return this.sectionVisibility[section] !== false;
  }

  getSectionOptionLabel(option: {key: string; label: string}): string {
    return this.t.translate(option.label);
  }

  onSectionVisibilityCheckboxChange(section: string, visible: boolean): void {
    const currentlyVisible = this.sectionVisibility[section] !== false;
    if (visible === currentlyVisible) {
      return;
    }
    this.toggleSectionVisibility(section);
  }

  isHomeItemVisible(key: HomeItemVisibilityKey): boolean {
    return this.homeItemVisibility[key] !== false;
  }

  getHomeItemOptionLabel(option: {key: HomeItemVisibilityKey; label: string}): string {
    return this.t.translate(option.label);
  }

  onHomeItemVisibilityCheckboxChange(key: HomeItemVisibilityKey, visible: boolean): void {
    const currentlyVisible = this.isHomeItemVisible(key);
    if (visible === currentlyVisible) {
      return;
    }

    const visibleCount = Object.values(this.homeItemVisibility).filter(Boolean).length;
    if (currentlyVisible && visibleCount <= 1) {
      return;
    }

    this.homeItemVisibility = {
      ...this.homeItemVisibility,
      [key]: visible,
    };
    this.homeItemVisibilitySubject.next({...this.homeItemVisibility});
    this.localStorageService.set(this.sectionVisibilityKey, this.buildSidebarVisibilitySettings());
    this.persistSectionVisibility();
  }

  navigateToSettings(): void {
    this.router.navigate(['/settings'], {queryParams: {returnTo: this.router.url}});
  }

  openAcknowledgementsDialog(): void {
    this.dialogLauncherService.openAcknowledgementsDialog();
  }

  switchLanguage(lang: string): void {
    if (lang === this.activeLang) return;
    this.t.load(lang).subscribe(() => {
      this.t.setActiveLang(lang);
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      this.activeLang = lang;
      this.buildLangMenu();
    });
  }

  private buildLangMenu(): void {
    this.langMenuItems = AVAILABLE_LANGS.map((lang: string) => ({
      label: LANG_LABELS[lang] || lang,
      icon: lang === this.activeLang ? 'pi pi-check' : undefined,
      command: () => this.switchLanguage(lang),
    }));
  }

  private syncActiveBookTypeFilterFromUrl(): void {
    const filterParam = this.router.parseUrl(this.router.url).queryParams['filter'];
    if (typeof filterParam !== 'string' || !filterParam) {
      this.activeBookTypeFilter = null;
      return;
    }

    const entries = filterParam.split(',');
    const customTypeEntry = entries.find(entry => entry.startsWith('customMediaType:'))
      ?? entries.find(entry => entry.startsWith('customBookType:'));
    if (!customTypeEntry) {
      this.activeBookTypeFilter = null;
      return;
    }


    const keyLength = customTypeEntry.startsWith('customMediaType:')
      ? 'customMediaType:'.length
      : 'customBookType:'.length;
    const rawValue = customTypeEntry.substring(keyLength).split('|')[0]?.trim();
    const decodedValue = rawValue ? decodeURIComponent(rawValue) : null;
    this.activeBookTypeFilter = decodedValue === 'PHYSICAL' ? null : decodedValue;
  }

  private getStoredCustomBookTypes(): string[] {
    return this.mediaTypePreferences.getCustomTypes();
  }

  private setStoredMediaTypes(types: string[]): void {
    this.mediaTypePreferences.setCustomTypes(types);
  }

  private createMediaTypeMenuItem(label: string, count: number): AppMenuItem {
    return {
      label,
      type: 'MediaType',
      icon: 'pi pi-file',
      menu: this.getMediaTypeMenuItems(label),
      routerLink: ['/all-books'],
      queryParams: {
        filter: `customMediaType:${encodeURIComponent(label)}`,
      },
      activeMatch: () => this.isBookTypeFilterActive(label),
      bookCount$: of(count),
    };
  }

  private getNavigationMediaType(book: { fileType?: string | null; isPhysical?: boolean }): string | null {
    const fileType = (book.fileType ?? '').trim();
    if (!fileType || fileType.toUpperCase() === 'PHYSICAL') {
      return null;
    }

    return fileType;
  }

  private openMediaTypeManagerDialog(): void {
    this.bookDialogHelperService.openMediaTypeManagerDialog();
  }

  private editMediaType(mediaType: string): void {
    const next = window.prompt('Edit Media Type', mediaType)?.trim();
    if (!next || next === mediaType) {
      return;
    }

    const existing = this.getStoredCustomBookTypes();
    if (existing.some(type => type.toLowerCase() === next.toLowerCase() && type.toLowerCase() !== mediaType.toLowerCase())) {
      this.messageService.add({severity: 'warn', summary: 'Media Type exists', detail: 'That Media Type already exists.'});
      return;
    }

    const updated = existing.map(type => type.toLowerCase() === mediaType.toLowerCase() ? next : type);
    this.setStoredMediaTypes([...new Set(updated)].sort((a, b) => a.localeCompare(b)));

    const ids = new Set((this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .map(book => book.id));

    if (!ids.size) {
      if (this.activeBookTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
        this.selectBookTypeFilter(next);
      }
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type renamed.'});
      return;
    }

    this.bookService.updateFileType(ids, next).subscribe({
      next: () => {
        if (this.activeBookTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
          this.selectBookTypeFilter(next);
        }
        this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type renamed.'});
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to rename Media Type.'});
      }
    });
  }

  private deleteMediaType(mediaType: string): void {
    if (!window.confirm(`Delete Media Type "${mediaType}"?`)) {
      return;
    }

    const updated = this.getStoredCustomBookTypes().filter(type => type.toLowerCase() !== mediaType.toLowerCase());
    this.setStoredMediaTypes(updated);

    const ids = new Set((this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .map(book => book.id));

    if (!ids.size) {
      if (this.activeBookTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
        this.router.navigate(['/all-books'], {
          queryParams: {filter: null},
          queryParamsHandling: 'merge'
        });
      }
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type deleted.'});
      return;
    }

    this.bookService.updateFileType(ids, null).subscribe({
      next: () => {
        if (this.activeBookTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
          this.router.navigate(['/all-books'], {
            queryParams: {filter: null},
            queryParamsHandling: 'merge'
          });
        }
        this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type deleted.'});
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to delete Media Type.'});
      }
    });
  }

  private initMenus(): void {
    this.libraryMenu$ = combineLatest([this.libraryService.libraryState$, this.t.langChanges$]).pipe(
      map(([state]) => {
        const libraries = state.libraries ?? [];
        const sortedLibraries = this.sortArray(libraries, this.librarySortField, this.librarySortOrder);
        return [
          {
            label: this.t.translate('layout.menu.libraries'),
            type: 'library',
            hasDropDown: true,
            hasCreate: true,
            items: sortedLibraries.map((library) => ({
              menu: this.libraryShelfMenuService.initializeLibraryMenuItems(library),
              label: library.name,
              type: 'Library',
              icon: library.icon || undefined,
              iconType: (library.iconType || undefined) as 'PRIME_NG' | 'CUSTOM_SVG' | undefined,
              routerLink: [`/library/${library.id}/books`],
              prefetchLibraryId: library.id ?? undefined,
              bookCount$: this.libraryService.getBookCount(library.id ?? 0),
              unhealthy$: this.libraryHealthService.isUnhealthy$(library.id ?? 0),
            })),
          },
        ];
      }),
      map(menuItems => this.applyNestedItemOrder('library', menuItems))
    );

    this.magicShelfMenu$ = combineLatest([this.magicShelfService.shelvesState$, this.t.langChanges$]).pipe(
      map(([state]: [MagicShelfState, string]) => {
        const shelves = state.shelves ?? [];
        const sortedShelves = this.sortArray(shelves, this.magicShelfSortField, this.magicShelfSortOrder);
        return [
          {
            label: this.t.translate('layout.menu.magicShelves'),
            type: 'magicShelf',
            hasDropDown: true,
            hasCreate: true,
            items: sortedShelves.map((shelf) => ({
              label: shelf.name,
              type: 'magicShelfItem',
              icon: shelf.icon || undefined,
              iconType: (shelf.iconType || undefined) as 'PRIME_NG' | 'CUSTOM_SVG' | undefined,
              menu: this.libraryShelfMenuService.initializeMagicShelfMenuItems(shelf),
              routerLink: [`/magic-shelf/${shelf.id}/books`],
              bookCount$: this.magicShelfService.getBookCount(shelf.id ?? 0),
            })),
          },
        ];
      }),
      map(menuItems => this.applyNestedItemOrder('magicShelf', menuItems))
    );

    this.shelfMenu$ = combineLatest([this.shelfService.shelfState$, this.t.langChanges$]).pipe(
      map(([state]) => {
        const shelves = state.shelves ?? [];
        const sortedShelves = this.sortArray(shelves, this.shelfSortField, this.shelfSortOrder);

        const koboShelfIndex = sortedShelves.findIndex(shelf => shelf.name === 'Kobo');
        let koboShelf = null;
        if (koboShelfIndex !== -1) {
          koboShelf = sortedShelves.splice(koboShelfIndex, 1)[0];
        }

        const shelfItems = sortedShelves.map((shelf) => ({
          menu: this.libraryShelfMenuService.initializeShelfMenuItems(shelf),
          label: shelf.name,
          type: 'Shelf',
          icon: shelf.icon || undefined,
          iconType: (shelf.iconType || undefined) as 'PRIME_NG' | 'CUSTOM_SVG' | undefined,
          routerLink: [`/shelf/${shelf.id}/books`],
          bookCount$: this.shelfService.getBookCount(shelf.id ?? 0),
        }));

        const notShelfedItem = {
          label: this.t.translate('layout.menu.unshelved'),
          type: 'Shelf',
          icon: 'pi pi-inbox',
          iconType: 'PRIME_NG' as 'PRIME_NG' | 'CUSTOM_SVG',
          routerLink: ['/not-shelfed'],
          bookCount$: this.shelfService.getUnshelvedBookCount?.() ?? of(0),
          showBookCount: true,
        };

          const items: AppMenuItem[] = [notShelfedItem];
        if (koboShelf) {
          items.push({
            label: koboShelf.name,
            type: 'Shelf',
            icon: koboShelf.icon || undefined,
            iconType: (koboShelf.iconType || undefined) as 'PRIME_NG' | 'CUSTOM_SVG' | undefined,
            routerLink: [`/shelf/${koboShelf.id}/books`],
            bookCount$: this.shelfService.getBookCount(koboShelf.id ?? 0),
          });
        }
        items.push(...shelfItems);

        return [
          {
            type: 'shelf',
            label: this.t.translate('layout.menu.shelves'),
            hasDropDown: true,
            hasCreate: true,
            items,
          },
        ];
      }),
      map(menuItems => this.applyNestedItemOrder('shelf', menuItems))
    );
  }

  openChangelogDialog() {
    this.dialogLauncherService.openVersionChangelogDialog();
  }

  getVersionUrl(current: string | undefined, latest?: string | undefined): string {
    if (this.shouldShowCombinedVersion(current, latest)) {
      const stableVersion = this.getNormalizedSemanticVersion(latest);
      return stableVersion
        ? `https://github.com/booklore-app/booklore/releases/tag/${stableVersion}`
        : '#';
    }

    const version = this.getPreferredDisplayVersion(current, latest);
    if (!version) return '#';
    const normalizedVersion = this.getNormalizedSemanticVersion(version);
    return normalizedVersion
      ? `https://github.com/booklore-app/booklore/releases/tag/${normalizedVersion}`
      : `https://github.com/booklore-app/booklore/commit/${version}`;
  }

  isSemanticVersion(current: string | undefined, latest?: string | undefined): boolean {
    if (this.shouldShowCombinedVersion(current, latest)) {
      return false;
    }
    return !!this.getNormalizedSemanticVersion(this.getPreferredDisplayVersion(current, latest));
  }

  shouldShowUpdateLink(current: string | undefined, latest?: string | undefined): boolean {
    const normalizedCurrent = this.getNormalizedSemanticVersion(current);
    const normalizedLatest = this.getNormalizedSemanticVersion(latest);
    return !!normalizedCurrent && !!normalizedLatest && normalizedCurrent !== normalizedLatest;
  }

  getDisplayVersion(current: string | undefined, latest?: string | undefined): string {
    if (this.shouldShowCombinedVersion(current, latest)) {
      const buildLabel = this.getNormalizedDisplayVersion(current);
      const stableLabel = this.getNormalizedSemanticVersion(latest);
      if (buildLabel && stableLabel) {
        return `${buildLabel} · latest ${stableLabel}`;
      }
    }

    const version = this.getPreferredDisplayVersion(current, latest);
    return this.getNormalizedSemanticVersion(version) ?? this.getNormalizedDisplayVersion(version) ?? 'unknown';
  }

  getVersionTooltip(current: string | undefined, latest?: string | undefined): string {
    const normalizedCurrent = this.getNormalizedDisplayVersion(current);
    const normalizedLatest = this.getNormalizedSemanticVersion(latest);

    if (this.shouldShowCombinedVersion(current, latest) && normalizedCurrent && normalizedLatest) {
      return `Current build: ${normalizedCurrent}. Latest stable release: ${normalizedLatest}.`;
    }

    const semanticCurrent = this.getNormalizedSemanticVersion(current);
    if (semanticCurrent) {
      return `Current release: ${semanticCurrent}.`;
    }

    if (normalizedCurrent) {
      return `Current build: ${normalizedCurrent}.`;
    }

    return 'Version information is temporarily unavailable.';
  }

  private getPreferredDisplayVersion(current: string | undefined, latest?: string | undefined): string | undefined {
    const normalizedCurrent = this.getNormalizedDisplayVersion(current);
    const normalizedLatest = this.getNormalizedDisplayVersion(latest);

    if (this.getNormalizedSemanticVersion(normalizedCurrent)) {
      return normalizedCurrent;
    }
    if (this.getNormalizedSemanticVersion(normalizedLatest)) {
      return normalizedLatest;
    }
    return normalizedCurrent ?? normalizedLatest;
  }

  private shouldShowCombinedVersion(current: string | undefined, latest?: string | undefined): boolean {
    const normalizedCurrent = this.getNormalizedDisplayVersion(current);
    const normalizedLatest = this.getNormalizedDisplayVersion(latest);
    if (!normalizedCurrent || !normalizedLatest) {
      return false;
    }

    return !this.getNormalizedSemanticVersion(normalizedCurrent)
      && !!this.getNormalizedSemanticVersion(normalizedLatest)
      && normalizedCurrent !== normalizedLatest;
  }

  private getNormalizedDisplayVersion(version: string | undefined): string | undefined {
    if (!version) {
      return undefined;
    }

    const trimmed = version.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private getNormalizedSemanticVersion(version: string | undefined): string | null {
    if (!version) return null;
    const semanticVersionPattern = /^v?(\d+\.\d+\.\d+)$/;
    const match = version.trim().match(semanticVersionPattern);
    return match ? `v${match[1]}` : null;
  }

  private sortArray<T>(array: T[], field: 'name' | 'id', order: 'asc' | 'desc'): T[] {
    return [...array].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[field] ?? '';
      const bVal = (b as Record<string, unknown>)[field] ?? '';
      let comparison = 0;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }

  private validateSortField(field: string): 'name' | 'id' {
    return field === 'id' ? 'id' : 'name';
  }

  private validateSortOrder(order: string): 'asc' | 'desc' {
    return order === 'desc' ? 'desc' : 'asc';
  }

  private normalizeSectionOrder(savedOrder: string[]): string[] {
    const defaults = ['home', 'library', 'shelf', 'magicShelf', 'bookType'];
    const filtered = savedOrder.filter(section => defaults.includes(section));
    for (const section of defaults) {
      if (!filtered.includes(section)) {
        filtered.push(section);
      }
    }
    return filtered;
  }

  private normalizeSectionVisibility(savedVisibility: Record<string, boolean> | null | undefined): Record<string, boolean> {
    return {
      home: savedVisibility?.['home'] ?? true,
      library: savedVisibility?.['library'] ?? true,
      shelf: savedVisibility?.['shelf'] ?? true,
      magicShelf: savedVisibility?.['magicShelf'] ?? true,
      bookType: savedVisibility?.['bookType'] ?? false,
    };
  }

  private normalizeHomeItemVisibility(savedVisibility: Record<string, boolean> | null | undefined): Record<HomeItemVisibilityKey, boolean> {
    return {
      dashboard: savedVisibility?.['home.dashboard'] ?? true,
      allBooks: savedVisibility?.['home.allBooks'] ?? true,
      physicalBooks: savedVisibility?.['home.physicalBooks'] ?? true,
      series: savedVisibility?.['home.series'] ?? true,
      authors: savedVisibility?.['home.authors'] ?? true,
      notebook: savedVisibility?.['home.notebook'] ?? true,
    };
  }

  private initializeSectionVisibilityForUser(userId: number | null, persistedVisibility: Record<string, boolean> | null | undefined): void {
    const normalizedPersisted = this.buildNormalizedSidebarVisibility(persistedVisibility);

    if (persistedVisibility) {
      this.applySidebarVisibility(normalizedPersisted);
      this.localStorageService.set(this.sectionVisibilityKey, normalizedPersisted);
      if (userId != null && this.requiresSidebarVisibilityMigration(persistedVisibility, normalizedPersisted)) {
        this.userService.updateUserSetting(userId, 'sidebarSectionVisibility', normalizedPersisted);
      }
      return;
    }

    if (this.initialSectionVisibilityFromStorage) {
      const migrated = this.buildNormalizedSidebarVisibility(this.initialSectionVisibilityFromStorage);
      this.applySidebarVisibility(migrated);
      if (userId != null) {
        this.userService.updateUserSetting(userId, 'sidebarSectionVisibility', migrated);
      }
      return;
    }

    this.applySidebarVisibility(undefined);
  }

  private persistSectionVisibility(): void {
    const userId = this.userService.getCurrentUser()?.id;
    if (userId == null) {
      return;
    }

    this.userService.updateUserSetting(userId, 'sidebarSectionVisibility', this.buildSidebarVisibilitySettings());
  }

  private applySidebarVisibility(savedVisibility: Record<string, boolean> | null | undefined): void {
    this.sectionVisibility = this.normalizeSectionVisibility(savedVisibility);
    this.homeItemVisibility = this.normalizeHomeItemVisibility(savedVisibility);
    this.homeItemVisibilitySubject.next({...this.homeItemVisibility});
  }

  private buildNormalizedSidebarVisibility(savedVisibility: Record<string, boolean> | null | undefined): Record<string, boolean> {
    const homeItemVisibility = this.normalizeHomeItemVisibility(savedVisibility);

    return {
      ...this.normalizeSectionVisibility(savedVisibility),
      'home.dashboard': homeItemVisibility.dashboard,
      'home.allBooks': homeItemVisibility.allBooks,
      'home.physicalBooks': homeItemVisibility.physicalBooks,
      'home.series': homeItemVisibility.series,
      'home.authors': homeItemVisibility.authors,
      'home.notebook': homeItemVisibility.notebook,
    };
  }

  private buildSidebarVisibilitySettings(): Record<string, boolean> {
    return {
      ...this.sectionVisibility,
      'home.dashboard': this.homeItemVisibility.dashboard,
      'home.allBooks': this.homeItemVisibility.allBooks,
      'home.physicalBooks': this.homeItemVisibility.physicalBooks,
      'home.series': this.homeItemVisibility.series,
      'home.authors': this.homeItemVisibility.authors,
      'home.notebook': this.homeItemVisibility.notebook,
    };
  }

  private requiresSidebarVisibilityMigration(
    persistedVisibility: Record<string, boolean>,
    normalizedVisibility: Record<string, boolean>
  ): boolean {
    return Object.keys(normalizedVisibility).some(key => persistedVisibility[key] !== normalizedVisibility[key]);
  }


  private applyNestedItemOrder(menuKey: string, menuItems: AppMenuItem[]): AppMenuItem[] {
    const savedOrder = this.localStorageService.get<string[]>(`${this.nestedOrderPrefix}${menuKey}`);
    if (!savedOrder?.length) {
      return menuItems;
    }

    return menuItems.map(item => {
      if (!item.items?.length) {
        return item;
      }

      const items = [...item.items];
      const lookup = new Map(items.map(child => [this.getMenuItemOrderId(child), child]));
      const ordered: AppMenuItem[] = [];

      for (const id of savedOrder) {
        const match = lookup.get(id);
        if (match) {
          ordered.push(match);
          lookup.delete(id);
        }
      }

      for (const child of items) {
        const id = this.getMenuItemOrderId(child);
        if (lookup.has(id)) {
          ordered.push(child);
          lookup.delete(id);
        }
      }

      return {
        ...item,
        items: ordered,
      };
    });
  }

  private applyBookTypeOrder(bookTypes: {label: string; count: number}[], savedOrder: string[]): {label: string; count: number}[] {
    if (!savedOrder.length) {
      return bookTypes;
    }

    const lookup = new Map(bookTypes.map(type => [type.label, type]));
    const ordered: {label: string; count: number}[] = [];

    for (const label of savedOrder) {
      const match = lookup.get(label);
      if (match) {
        ordered.push(match);
        lookup.delete(label);
      }
    }

    for (const type of bookTypes) {
      if (lookup.has(type.label)) {
        ordered.push(type);
        lookup.delete(type.label);
      }
    }

    return ordered;
  }

  private getMenuItemOrderId(item: MenuItem): string {
    const link = Array.isArray(item.routerLink) ? item.routerLink[0] : item.routerLink;
    return String(link ?? item.label ?? '');
  }
  private shouldSuppressTap(): boolean {
    return Date.now() < this.suppressTapUntil;
  }
}
