import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';

import {MetadataProgressWidgetComponent} from './metadata-progress-widget-component';
import {MetadataBatchProgressNotification, MetadataBatchStatus} from '../../model/metadata-batch-progress.model';
import {MetadataProgressService} from '../../service/metadata-progress.service';
import {MetadataTaskService} from '../../../features/book/service/metadata-task';
import {DialogLauncherService} from '../../services/dialog-launcher.service';
import {NotificationEventService} from '../../websocket/notification-event.service';

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
});
