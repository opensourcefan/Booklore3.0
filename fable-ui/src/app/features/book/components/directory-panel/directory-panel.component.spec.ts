import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {BookService} from '../../service/book.service';
import {DirectoryFilterService} from '../../service/directory-filter.service';
import {DirectoryPanelService} from '../../service/directory-panel.service';
import {DirectoryTreeService} from '../../service/directory-tree.service';
import {DirectoryPanelComponent} from './directory-panel.component';

describe('DirectoryPanelComponent branch rows', () => {
  const visible$ = new BehaviorSubject(true);
  const filter$ = new BehaviorSubject(null);
  const routerEvents$ = new Subject<unknown>();
  const bookState$ = new BehaviorSubject({loaded: false, error: null, books: []});

  const treeData = [
    {
      libraryId: 1,
      libraryName: 'Library A',
      libraryPathId: 101,
      rootPath: '/books/main',
      hasRootBooks: false,
      children: [
        {
          name: 'Authors',
          path: 'Authors',
          children: [
            {
              name: 'A',
              path: 'Authors/A',
            },
          ],
        },
        {
          name: 'Singles',
          path: 'Singles',
        },
      ],
    },
    {
      libraryId: 2,
      libraryName: 'Library B',
      libraryPathId: 202,
      rootPath: '/books/archive',
      hasRootBooks: false,
      children: [],
    },
  ];

  const treeServiceMock = {
    getAllLibrariesTree: vi.fn(() => of(treeData)),
    getTreeForLibrary: vi.fn(() => of(treeData)),
    invalidateAll: vi.fn(),
  };

  const filterServiceMock = {
    filter$: filter$.asObservable(),
    currentFilter: null,
    getScopeKeyFromUrl: vi.fn(() => 'all-books'),
    getScopedFilter: vi.fn((_scopeKey: string | null, filterValue: unknown) => filterValue),
    setFilter: vi.fn(),
  };

  const panelServiceMock = {
    visible$: visible$.asObservable(),
    close: vi.fn(),
  };

  const routerMock = {
    url: '/books',
    events: routerEvents$.asObservable(),
  };

  const bookServiceMock = {
    bookState$: bookState$.asObservable(),
  };

  beforeEach(async () => {
    visible$.next(true);
    filter$.next(null);
    bookState$.next({loaded: false, error: null, books: []});
    treeServiceMock.getAllLibrariesTree.mockClear();
    treeServiceMock.getTreeForLibrary.mockClear();
    treeServiceMock.invalidateAll.mockClear();
    filterServiceMock.getScopeKeyFromUrl.mockClear();
    filterServiceMock.getScopedFilter.mockClear();
    filterServiceMock.setFilter.mockClear();
    panelServiceMock.close.mockClear();

    await TestBed.configureTestingModule({
      imports: [DirectoryPanelComponent],
      providers: [
        {provide: Router, useValue: routerMock},
        {provide: DirectoryTreeService, useValue: treeServiceMock},
        {provide: DirectoryFilterService, useValue: filterServiceMock},
        {provide: DirectoryPanelService, useValue: panelServiceMock},
        {provide: BookService, useValue: bookServiceMock},
      ],
    }).compileComponents();
  });

  it('removes ban icons and marks branch rows when folders have children', () => {
    const fixture = TestBed.createComponent(DirectoryPanelComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const rootHeaders = root.querySelectorAll('.dir-tree-root__header');

    expect(root.querySelector('.pi-ban')).toBeNull();
    expect(rootHeaders[0]?.classList.contains('dir-tree-root__header--branch')).toBe(true);
    expect(rootHeaders[1]?.classList.contains('dir-tree-root__header--branch')).toBe(false);

    const expandButton = root.querySelector('.dir-tree-root__toggle') as HTMLButtonElement;
    expandButton.click();
    fixture.detectChanges();

    const childRows = root.querySelectorAll('.dir-tree-node__body');

    expect(childRows[0]?.classList.contains('dir-tree-node__body--branch')).toBe(true);
    expect(childRows[1]?.classList.contains('dir-tree-node__body--branch')).toBe(false);
  });
});