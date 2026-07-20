import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';

import {MetadataProgressWidgetComponent} from './metadata-progress-widget-component';
import {
  MetadataBatchPhase,
  MetadataBatchProgressNotification,
  MetadataBatchStatus
} from '../../model/metadata-batch-progress.model';
import {MetadataProgressService} from '../../service/metadata-progress.service';
import {MetadataTaskService} from '../../../features/book/service/metadata-task';
import {DialogLauncherService} from '../../services/dialog-launcher.service';
import {NotificationEventService} from '../../websocket/notification-event.service';
import {FailureNotificationService} from '../../service/failure-notification.service';

describe('MetadataProgressWidgetComponent', () => {
  let activeTasksSubject: BehaviorSubject<Record<string, MetadataBatchProgressNotification>>;

  beforeEach(async () => {
    activeTasksSubject = new BehaviorSubject<Record<string, MetadataBatchProgressNotification>>({});

    await TestBed.configureTestingModule({
      imports: [MetadataProgressWidgetComponent],
      providers: [
        {
          provide: MetadataProgressService,
          useValue: {
            activeTasks$: activeTasksSubject.asObservable(),
            clearTask: vi.fn(),
            markCancellationRequested: vi.fn(),
          },
        },
        {
          provide: MetadataTaskService,
          useValue: {
            deleteTask: vi.fn().mockReturnValue(of(void 0)),
            cancelTask: vi.fn().mockReturnValue(of({})),
            resumeTask: vi.fn().mockReturnValue(of({})),
          },
        },
        {
          provide: DialogLauncherService,
          useValue: {
            openMetadataReviewDialog: vi.fn(),
          },
        },
        {
          provide: NotificationEventService,
          useValue: {
            clearNotification: vi.fn(),
          },
        },
        {
          provide: FailureNotificationService,
          useValue: {
            reportSafe: vi.fn(),
          },
        },
        {
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => key,
            langChanges$: of('en'),
            config: {
              reRenderOnLangChange: true,
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('treats completed review tasks with no remaining items as non-review', () => {
    const fixture = TestBed.createComponent(MetadataProgressWidgetComponent);
    const component = fixture.componentInstance;

    expect(component.hasReviewItems({
      taskId: 'task-1',
      completed: 3,
      total: 3,
      message: 'Done',
      status: MetadataBatchStatus.COMPLETED,
      review: true,
    })).toBe(false);
  });

  it('treats completed review tasks with remaining items as review', () => {
    const fixture = TestBed.createComponent(MetadataProgressWidgetComponent);
    const component = fixture.componentInstance;

    expect(component.hasReviewItems({
      taskId: 'task-1',
      completed: 1,
      total: 3,
      message: 'Review pending',
      status: MetadataBatchStatus.COMPLETED,
      review: true,
    })).toBe(true);
  });

  it('maps ISBN phases to titles and tone classes', () => {
    const fixture = TestBed.createComponent(MetadataProgressWidgetComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();

    const discovery: MetadataBatchProgressNotification = {
      taskId: 'isbn-1',
      completed: 0,
      total: 1,
      message: 'ISBN fetch',
      status: MetadataBatchStatus.IN_PROGRESS,
      review: false,
      phase: MetadataBatchPhase.ISBN_DISCOVERY,
    };
    activeTasksSubject.next({'isbn-1': discovery});

    expect(component.getTaskTitle('isbn-1', discovery))
      .toBe('shared.metadataProgress.taskTitleIsbnDiscovery');
    expect(component.getPhaseToneClass('isbn-1', discovery)).toEqual({
      'task-card--phase-isbn': true,
      'task-card--phase-metadata': false,
      'task-card--phase-isbn-failed': false,
    });

    const metadata: MetadataBatchProgressNotification = {
      ...discovery,
      message: 'Metadata fetch',
      phase: MetadataBatchPhase.METADATA_FETCH,
    };
    activeTasksSubject.next({'isbn-1': metadata});

    expect(component.getTaskTitle('isbn-1', metadata))
      .toBe('shared.metadataProgress.taskTitleMetadataFetch');
    expect(component.getPhaseToneClass('isbn-1', metadata)['task-card--phase-metadata']).toBe(true);
  });

  it('keeps ISBN_FAILED flash for 2.5s even if a later phase arrives', () => {
    const deferred: (() => void)[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        deferred.push(handler as () => void);
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      const fixture = TestBed.createComponent(MetadataProgressWidgetComponent);
      const component = fixture.componentInstance;
      component.ngOnInit();

      const failed: MetadataBatchProgressNotification = {
        taskId: 'isbn-1',
        completed: 0,
        total: 1,
        message: 'No ISBN',
        status: MetadataBatchStatus.IN_PROGRESS,
        review: false,
        phase: MetadataBatchPhase.ISBN_FAILED,
      };
      activeTasksSubject.next({'isbn-1': failed});

      expect(component.getDisplayPhase('isbn-1', failed)).toBe(MetadataBatchPhase.ISBN_FAILED);
      expect(deferred.length).toBeGreaterThan(0);

      const nextPhase: MetadataBatchProgressNotification = {
        ...failed,
        completed: 1,
        status: MetadataBatchStatus.COMPLETED,
        phase: null,
        message: 'Done',
      };
      activeTasksSubject.next({'isbn-1': nextPhase});

      expect(component.getDisplayPhase('isbn-1', nextPhase)).toBe(MetadataBatchPhase.ISBN_FAILED);

      deferred.forEach(fn => fn());

      expect(component.getDisplayPhase('isbn-1', nextPhase)).toBeNull();
      component.ngOnDestroy();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('uses default metadata title when phase is absent', () => {
    const fixture = TestBed.createComponent(MetadataProgressWidgetComponent);
    const component = fixture.componentInstance;

    const task: MetadataBatchProgressNotification = {
      taskId: 'meta-1',
      completed: 0,
      total: 2,
      message: 'Fetching',
      status: MetadataBatchStatus.IN_PROGRESS,
      review: false,
    };

    expect(component.getTaskTitle('meta-1', task)).toBe('shared.metadataProgress.taskTitle');
    expect(component.getPhaseToneClass('meta-1', task)).toEqual({
      'task-card--phase-isbn': false,
      'task-card--phase-metadata': false,
      'task-card--phase-isbn-failed': false,
    });
  });
});
