import {HttpClient} from '@angular/common/http';
import {TestBed} from '@angular/core/testing';
import {MessageService} from 'primeng/api';
import {defer, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoService} from '@jsverse/transloco';
import {BookService} from './book.service';
import {BookMetadataManageService} from './book-metadata-manage.service';
import {BookSocketService} from './book-socket.service';
import {BookStateService} from './book-state.service';

describe('BookMetadataManageService', () => {
  let service: BookMetadataManageService;
  let httpPutSpy: ReturnType<typeof vi.fn>;
  let refreshSubscriptions: number;
  let handleBookMetadataUpdateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpPutSpy = vi.fn();
    handleBookMetadataUpdateSpy = vi.fn();
    refreshSubscriptions = 0;

    TestBed.configureTestingModule({
      providers: [
        BookMetadataManageService,
        {
          provide: HttpClient,
          useValue: {
            put: httpPutSpy,
            post: vi.fn(),
            get: vi.fn(),
          },
        },
        {
          provide: BookService,
          useValue: {
            refreshBooks: vi.fn(() => defer(() => {
              refreshSubscriptions += 1;
              return of([]);
            })),
          },
        },
        {
          provide: BookSocketService,
          useValue: {
            handleBookMetadataUpdate: handleBookMetadataUpdateSpy,
          },
        },
        {
          provide: BookStateService,
          useValue: {
            getCurrentBookState: vi.fn(() => ({books: [], loaded: true, error: null})),
            updateBookState: vi.fn(),
          },
        },
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: TranslocoService, useValue: {translate: vi.fn((key: string) => key)}},
      ]
    });

    service = TestBed.inject(BookMetadataManageService);
  });

  it('subscribes to the book refresh after bulk metadata updates', async () => {
    httpPutSpy.mockReturnValue(of(void 0));

    await new Promise<void>((resolve, reject) => {
      service.updateBooksMetadata({bookIds: [1], tags: ['Tag A']}).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(refreshSubscriptions).toBe(1);
  });

  it('subscribes to the book refresh after single-book metadata updates', async () => {
    const updatedMetadata = {bookId: 4, tags: ['Tag A']} as never;
    httpPutSpy.mockReturnValue(of(updatedMetadata));

    await new Promise<void>((resolve, reject) => {
      service.updateBookMetadata(4, {metadata: {tags: ['Tag A']}} as never, false).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(handleBookMetadataUpdateSpy).toHaveBeenCalledWith(4, updatedMetadata);
    expect(refreshSubscriptions).toBe(1);
  });
});