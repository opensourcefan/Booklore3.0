import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, throwError} from 'rxjs';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';

import {DuplicateMergerComponent} from './duplicate-merger.component';
import {BookFileService} from '../../service/book-file.service';
import {BookStateService} from '../../service/book-state.service';
import {BookDialogHelperService} from '../book-browser/book-dialog-helper.service';
import {BookService} from '../../service/book.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Book, DuplicateDetectionRequest, DuplicateGroup} from '../../model/book.model';
import {UserService} from '../../../settings/user-management/user.service';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    metadata: overrides.metadata,
    primaryFile: overrides.primaryFile,
    alternativeFormats: overrides.alternativeFormats,
    isPhysical: overrides.isPhysical,
    ...overrides,
  } as Book;
}

describe('DuplicateMergerComponent', () => {
  interface TestUserState {
    user: {id: number; userSettings: Record<string, unknown>} | null;
    loaded: boolean;
    error: string | null;
  }

  let component: DuplicateMergerComponent;
  let findDuplicatesSpy: ReturnType<typeof vi.fn>;
  let openBookDetailsSpy: ReturnType<typeof vi.fn>;
  let readBookSpy: ReturnType<typeof vi.fn>;
  let addMessageSpy: ReturnType<typeof vi.fn>;
  let updateUserSettingSpy: ReturnType<typeof vi.fn>;
  let userStateSubject: BehaviorSubject<TestUserState>;
  let dialogConfig: {data: {libraryId?: number; libraryName?: string}};

  const savedPlan = {
    savedAt: '2026-04-06T18:30:00Z',
    scope: 'CURRENT_LIBRARY',
    scopeLabel: 'Current library',
    scopeDescription: 'Scan this library',
    matchingSignals: ['ISBN', 'External ID', 'Title + Author'],
    matchingConfig: {
      matchByIsbn: true,
      matchByExternalId: true,
      matchByTitleAuthor: true,
      matchByDirectory: false,
      matchByFilename: false,
    },
    queuedGroupCount: 1,
    entries: [
      {
        groupIndex: 1,
        matchReason: 'ISBN',
        keepBookId: 11,
        keepTitle: 'Saga Volume One',
        candidateBookIds: [10],
        books: [
          {
            id: 10,
            title: 'Saga Vol. 1',
            authors: 'Brian K. Vaughan',
            library: 'Comics',
            formats: 'CBX',
            path: 'Saga/Saga 001.cbz',
            isPreferredKeep: false,
            isSuggestedKeep: true,
          },
          {
            id: 11,
            title: 'Saga Volume One',
            authors: 'Brian K. Vaughan',
            library: 'Comics',
            formats: 'CBX',
            path: 'Saga/Saga Volume One.cbz',
            isPreferredKeep: true,
            isSuggestedKeep: false,
          },
        ],
      },
    ],
  };

  const mockGroups: DuplicateGroup[] = [
    {
      suggestedTargetBookId: 10,
      matchReason: 'ISBN',
      books: [
        createBook({
          id: 10,
          libraryId: 5,
          libraryName: 'Comics',
          metadata: {
            title: 'Saga Vol. 1',
            authors: ['Brian K. Vaughan'],
            seriesName: 'Saga',
            seriesNumber: 1,
            isbn13: '9781607066019',
          } as Book['metadata'],
          primaryFile: {
            id: 100,
            bookId: 10,
            bookType: 'CBX',
            fileSubPath: 'Saga',
            fileName: 'Saga 001.cbz',
          },
        }),
        createBook({
          id: 11,
          libraryId: 5,
          libraryName: 'Comics',
          metadata: {
            title: 'Saga Volume One',
            authors: ['Brian K. Vaughan'],
            goodreadsId: '12345',
          } as Book['metadata'],
          primaryFile: {
            id: 101,
            bookId: 11,
            bookType: 'CBX',
            fileSubPath: 'Saga',
            fileName: 'Saga Volume One.cbz',
          },
        }),
      ],
    },
  ];

  beforeEach(() => {
    findDuplicatesSpy = vi.fn().mockReturnValue(of(mockGroups));
    openBookDetailsSpy = vi.fn();
    readBookSpy = vi.fn();
    addMessageSpy = vi.fn();
    updateUserSettingSpy = vi.fn();
    userStateSubject = new BehaviorSubject<TestUserState>({
      user: {
        id: 77,
        userSettings: {},
      },
      loaded: true,
      error: null,
    });
    dialogConfig = {data: {libraryId: 5, libraryName: 'Comics'}};

    TestBed.configureTestingModule({
      providers: [
        {provide: BookFileService, useValue: {findDuplicates: findDuplicatesSpy}},
        {
          provide: BookStateService,
          useValue: {
            getCurrentBookState: vi.fn(() => ({
              loaded: true,
              error: null,
              books: [
                createBook({id: 10, libraryId: 5, libraryName: 'Comics'}),
                createBook({id: 11, libraryId: 5, libraryName: 'Comics'}),
                createBook({id: 12, libraryId: 7, libraryName: 'Books'}),
              ],
            })),
          },
        },
        {provide: BookDialogHelperService, useValue: {openBookDetailsDialog: openBookDetailsSpy}},
        {provide: BookService, useValue: {readBook: readBookSpy}},
        {
          provide: UserService,
          useValue: {
            userState$: userStateSubject.asObservable(),
            getCurrentUser: vi.fn(() => ({id: 77})),
            updateUserSetting: updateUserSettingSpy,
          },
        },
        {provide: MessageService, useValue: {add: addMessageSpy}},
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: DynamicDialogConfig, useValue: dialogConfig},
        {
          provide: TranslocoService,
          useValue: {
            translate: vi.fn((key: string, params?: Record<string, unknown>) => {
              if (params?.['name']) {
                return `${key}:${params['name']}`;
              }
              return key;
            }),
          },
        },
        {provide: UrlHelperService, useValue: {getThumbnailUrl: vi.fn(() => '/cover.png')}},
      ],
    });

    component = TestBed.createComponent(DuplicateMergerComponent).componentInstance;
    component.ngOnInit();
  });

  it('defaults to current library scope when opened from a library', () => {
    expect(component.selectedScope).toBe('CURRENT_LIBRARY');
    expect(component.currentViewBookIds).toEqual([10, 11, 12]);
  });

  it('uses explicit visible book ids when scanning the current filtered view', () => {
    component.selectScope('BOOK_IDS');
    component.scan();

    expect(findDuplicatesSpy).toHaveBeenCalledWith({
      scope: 'BOOK_IDS',
      bookIds: [10, 11, 12],
      libraryId: undefined,
      matchByIsbn: true,
      matchByExternalId: true,
      matchByTitleAuthor: true,
      matchByDirectory: false,
      matchByFilename: false,
    } satisfies DuplicateDetectionRequest);
    expect(component.groups[0].inspectedBookId).toBe(10);
  });

  it('uses the current library id when scanning the library scope', () => {
    component.selectScope('CURRENT_LIBRARY');
    component.scan();

    expect(findDuplicatesSpy).toHaveBeenCalledWith({
      scope: 'CURRENT_LIBRARY',
      libraryId: 5,
      bookIds: undefined,
      matchByIsbn: true,
      matchByExternalId: true,
      matchByTitleAuthor: true,
      matchByDirectory: false,
      matchByFilename: false,
    } satisfies DuplicateDetectionRequest);
  });

  it('rehydrates a saved account plan onto matching scan results', () => {
    userStateSubject.next({
      user: {
        id: 77,
        userSettings: {
          duplicateResolutionPlan: savedPlan,
        },
      },
      loaded: true,
      error: null,
    });

    component.scan();

    expect(component.hasSavedPlan).toBe(true);
    expect(component.savedPlanEntries).toHaveLength(1);
    expect(component.getSavedEntryCandidateCount(component.savedPlanEntries[0])).toBe(1);
    expect(component.groups[0].preferredTargetBookId).toBe(11);
    expect(component.groups[0].queuedForPlan).toBe(true);
  });

  it('delegates safe inspection actions without mutating state', () => {
    component.scan();
    const group = component.groups[0];

    component.setInspectedBook(group, 11);
    component.openBookDetails(11);
    component.openBook(group.books[1]);

    expect(group.inspectedBookId).toBe(11);
    expect(openBookDetailsSpy).toHaveBeenCalledWith(11);
    expect(readBookSpy).toHaveBeenCalledWith(11);
  });

  it('builds a queued manual resolution plan with the preferred keep', () => {
    component.scan();
    const group = component.groups[0];

    component.setPreferredTarget(group, 11);
    component.toggleGroupPlan(group);

    const payload = component.buildResolutionPlanPayload();

    expect(payload.queuedGroupCount).toBe(1);
    expect(payload.entries[0]).toEqual(expect.objectContaining({
      keepBookId: 11,
      candidateBookIds: [10],
    }));
    expect(payload.entries[0].books.find(book => book.id === 11)).toEqual(expect.objectContaining({
      isPreferredKeep: true,
    }));
  });

  it('clears queued groups from the manual resolution plan', () => {
    component.scan();
    const group = component.groups[0];

    component.toggleGroupPlan(group);
    expect(component.plannedGroups).toHaveLength(1);

    component.clearResolutionPlan();
    expect(component.plannedGroups).toHaveLength(0);
    expect(updateUserSettingSpy).toHaveBeenLastCalledWith(77, 'duplicateResolutionPlan', null);
  });

  it('persists queued plan changes to the user settings store', () => {
    component.scan();
    const group = component.groups[0];

    component.toggleGroupPlan(group);

    expect(updateUserSettingSpy).toHaveBeenCalledWith(77, 'duplicateResolutionPlan', expect.objectContaining({
      queuedGroupCount: 1,
      scope: 'CURRENT_LIBRARY',
      entries: [expect.objectContaining({
        keepBookId: 10,
      })],
    }));
  });

  it('shows a translated error toast when the scan fails', () => {
    findDuplicatesSpy.mockReturnValueOnce(throwError(() => ({error: {message: 'backend failed'}})));

    component.scan();

    expect(addMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error',
      detail: 'backend failed',
    }));
  });
});