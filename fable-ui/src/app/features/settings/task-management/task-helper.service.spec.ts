import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FailureNotificationService} from '../../../shared/service/failure-notification.service';
import {TaskHelperService} from './task-helper.service';
import {TaskCreateRequest, TaskService, TaskStatus, TaskType} from './task.service';

describe('TaskHelperService ISBN discovery', () => {
  const startTask = vi.fn();

  beforeEach(() => {
    startTask.mockReset();
    startTask.mockReturnValue(of({
      taskId: 'isbn-task',
      taskType: TaskType.ISBN_DISCOVERY,
      status: TaskStatus.ACCEPTED,
    }));

    TestBed.configureTestingModule({
      providers: [
        TaskHelperService,
        {provide: TaskService, useValue: {startTask}},
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: FailureNotificationService, useValue: {reportSafe: vi.fn()}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key}},
      ],
    });
  });

  it('passes the selected provider subset to the ISBN task', () => {
    const service = TestBed.inject(TaskHelperService);

    service.isbnDiscoveryTask([10, 20], ['Google', 'Hardcover']).subscribe();

    expect(startTask).toHaveBeenCalledWith({
      taskType: TaskType.ISBN_DISCOVERY,
      triggeredByCron: false,
      options: {
        bookIds: [10, 20],
        providers: ['Google', 'Hardcover'],
      },
    } satisfies TaskCreateRequest);
  });
});
