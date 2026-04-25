import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {MetadataEditorComponent} from './metadata-editor.component';
import {Book} from '../../../../book/model/book.model';
import {BookService} from '../../../../book/service/book.service';
import {BookMetadataManageService} from '../../../../book/service/book-metadata-manage.service';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {BookDialogHelperService} from '../../../../book/components/book-browser/book-dialog-helper.service';
import {BookNavigationService} from '../../../../book/service/book-navigation.service';
import {BookMetadataHostService} from '../../../../../shared/service/book-metadata-host.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {WriteProgressService} from '../../../../../shared/service/write-progress.service';
import {TaskProgressPayload, TaskService, TaskStatus, TaskType} from '../../../../settings/task-management/task.service';

describe('MetadataEditorComponent auto fetch lifecycle', () => {
  let component: MetadataEditorComponent;
  let book$: BehaviorSubject<Book | null>;
  let taskProgress$: Subject<TaskProgressPayload | null>;
  let taskHelperMock: {refreshMetadataTask: ReturnType<typeof vi.fn>};

  const currentBook = {
    id: 42,
    metadata: {
      bookId: 42,
      title: 'Example Book',
      authors: [],
      categories: [],
      moods: [],
      tags: []
    }
  } as Book;

  beforeEach(() => {
    book$ = new BehaviorSubject<Book | null>(currentBook);
    taskProgress$ = new Subject<TaskProgressPayload | null>();
    taskHelperMock = {
      refreshMetadataTask: vi.fn().mockReturnValue(of({success: true, taskId: 'task-1'}))
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: ConfirmationService, useValue: {confirm: vi.fn()}},
        {provide: BookService, useValue: {bookState$: of({loaded: true, books: [currentBook]}), handleBookUpdate: vi.fn(), getBookByIdFromAPI: vi.fn()}},
        {provide: BookMetadataManageService, useValue: {}},
        {provide: TaskHelperService, useValue: taskHelperMock},
        {provide: TaskService, useValue: {taskProgress$: taskProgress$.asObservable()}},
        {provide: UrlHelperService, useValue: {}},
        {provide: BookDialogHelperService, useValue: {}},
        {provide: BookNavigationService, useValue: {getNavigationState: vi.fn().mockReturnValue(of(null))}},
        {provide: BookMetadataHostService, useValue: {}},
        {provide: Router, useValue: {navigate: vi.fn()}},
        {provide: UserService, useValue: {userState$: of({loaded: true, user: {userSettings: {metadataCenterViewMode: 'route', autoSaveMetadata: false}}})}},
        {provide: AppSettingsService, useValue: {appSettings$: of({metadataProviderSpecificFields: {}})}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key}},
        {provide: WriteProgressService, useValue: {show: vi.fn(), complete: vi.fn(), fail: vi.fn()}}
      ]
    });

    component = TestBed.runInInjectionContext(() => new MetadataEditorComponent());
    component.book$ = book$.asObservable();
    component.ngOnInit();
  });

  it('stays loading until the matching metadata task reaches a terminal state', () => {
    component.autoFetch(42);

    expect(component.isAutoFetching).toBe(true);
    expect(component.refreshingBookIds.has(42)).toBe(true);

    taskProgress$.next({
      taskId: 'other-task',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'other',
      progress: 100,
      taskStatus: TaskStatus.COMPLETED
    });

    expect(component.isAutoFetching).toBe(true);

    taskProgress$.next({
      taskId: 'task-1',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'working',
      progress: 25,
      taskStatus: TaskStatus.IN_PROGRESS
    });

    expect(component.isAutoFetching).toBe(true);

    taskProgress$.next({
      taskId: 'task-1',
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      message: 'done',
      progress: 100,
      taskStatus: TaskStatus.COMPLETED
    });

    expect(component.isAutoFetching).toBe(false);
    expect(component.refreshingBookIds.has(42)).toBe(false);
  });

  it('clears loading immediately when the metadata task fails to start', () => {
    taskHelperMock.refreshMetadataTask.mockReturnValue(of({success: false, taskId: null}));

    component.autoFetch(42);

    expect(component.isAutoFetching).toBe(false);
    expect(component.refreshingBookIds.has(42)).toBe(false);
  });
});