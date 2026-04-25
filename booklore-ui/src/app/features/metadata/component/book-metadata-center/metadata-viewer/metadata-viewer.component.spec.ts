import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {MetadataViewerComponent} from './metadata-viewer.component';
import {Book} from '../../../../book/model/book.model';
import {BookService} from '../../../../book/service/book.service';
import {BookFileService} from '../../../../book/service/book-file.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {EmailService} from '../../../../settings/email-v2/email.service';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {LibraryService} from '../../../../book/service/library.service';
import {BookDialogHelperService} from '../../../../book/components/book-browser/book-dialog-helper.service';
import {BookNavigationService} from '../../../../book/service/book-navigation.service';
import {BookMetadataHostService} from '../../../../../shared/service/book-metadata-host.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {AuthorService} from '../../../../author-browser/service/author.service';
import {TaskProgressPayload, TaskService, TaskStatus, TaskType} from '../../../../settings/task-management/task.service';

describe('MetadataViewerComponent refresh lifecycle', () => {
  let component: MetadataViewerComponent;
  let book$: BehaviorSubject<Book | null>;
  let taskProgress$: Subject<TaskProgressPayload | null>;
  let taskHelperMock: {refreshMetadataTask: ReturnType<typeof vi.fn>};

  const currentBook = {
    id: 77,
    libraryId: 9,
    libraryName: 'Viewer Library',
    metadata: {
      bookId: 77,
      title: 'Viewer Book',
      authors: [],
      categories: [],
      moods: [],
      tags: []
    },
    alternativeFormats: [],
    supplementaryFiles: []
  } as Book;

  beforeEach(() => {
    book$ = new BehaviorSubject<Book | null>(currentBook);
    taskProgress$ = new Subject<TaskProgressPayload | null>();
    taskHelperMock = {
      refreshMetadataTask: vi.fn().mockReturnValue(of({success: true, taskId: 'task-77'}))
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: TranslocoService, useValue: {translate: (key: string) => key}},
        {provide: LibraryService, useValue: {}},
        {provide: BookDialogHelperService, useValue: {}},
        {provide: EmailService, useValue: {}},
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: BookService, useValue: {getBooksInSeries: vi.fn().mockReturnValue(of([]))}},
        {provide: BookFileService, useValue: {}},
        {provide: TaskHelperService, useValue: taskHelperMock},
        {provide: TaskService, useValue: {taskProgress$: taskProgress$.asObservable()}},
        {provide: AuthorService, useValue: {}},
        {provide: UrlHelperService, useValue: {}},
        {provide: UserService, useValue: {userState$: of({loaded: true, user: {userSettings: {metadataCenterViewMode: 'route'}}})}},
        {provide: ConfirmationService, useValue: {confirm: vi.fn()}},
        {provide: Router, useValue: {navigate: vi.fn()}},
        {provide: BookNavigationService, useValue: {getNavigationState: vi.fn().mockReturnValue(of(null))}},
        {provide: BookMetadataHostService, useValue: {}},
        {provide: AppSettingsService, useValue: {appSettings$: of({metadataProviderSettings: {amazon: {domain: 'com'}}, allowFileDeletion: false})}}
      ]
    });

    component = TestBed.runInInjectionContext(() => new MetadataViewerComponent());
    component.book$ = book$.asObservable();
    component.ngOnInit();
  });

  it('keeps refresh loading active until the matching task finishes', () => {
    component.quickRefresh(77);

    expect(component.isAutoFetching).toBe(true);

    taskProgress$.next({
      taskId: 'other-task',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'other',
      progress: 100,
      taskStatus: TaskStatus.COMPLETED
    });

    expect(component.isAutoFetching).toBe(true);

    taskProgress$.next({
      taskId: 'task-77',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'running',
      progress: 50,
      taskStatus: TaskStatus.IN_PROGRESS
    });

    expect(component.isAutoFetching).toBe(true);

    taskProgress$.next({
      taskId: 'task-77',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'failed',
      progress: 100,
      taskStatus: TaskStatus.FAILED
    });

    expect(component.isAutoFetching).toBe(false);
  });

  it('clears refresh loading when the refreshed book arrives', () => {
    component.quickRefresh(77);

    expect(component.isAutoFetching).toBe(true);

    book$.next({
      ...currentBook,
      metadata: {
        bookId: 77,
        ...currentBook.metadata,
        title: 'Updated Viewer Book'
      }
    });

    expect(component.isAutoFetching).toBe(false);
  });
});