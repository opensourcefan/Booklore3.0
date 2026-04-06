import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
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
  let component: DuplicateMergerComponent;
  let findDuplicatesSpy: ReturnType<typeof vi.fn>;
  let openBookDetailsSpy: ReturnType<typeof vi.fn>;
  let readBookSpy: ReturnType<typeof vi.fn>;
  let addMessageSpy: ReturnType<typeof vi.fn>;
  let dialogConfig: {data: {libraryId?: number; libraryName?: string}};

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