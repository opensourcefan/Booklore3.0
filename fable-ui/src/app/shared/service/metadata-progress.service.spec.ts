import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, describe, expect, it} from 'vitest';
import {
  MetadataBatchPhase,
  MetadataBatchProgressNotification,
  MetadataBatchStatus
} from '../model/metadata-batch-progress.model';
import {mergeMetadataTaskProgress} from './metadata-progress.service';
import {MetadataProgressService} from './metadata-progress.service';
import {MetadataTaskService} from '../../features/book/service/metadata-task';
import {UserService} from '../../features/settings/user-management/user.service';

function progress(
  overrides: Partial<MetadataBatchProgressNotification> = {}
): MetadataBatchProgressNotification {
  return {
    taskId: 'task-1',
    completed: 0,
    total: 1,
    message: 'Working',
    status: MetadataBatchStatus.IN_PROGRESS,
    review: false,
    ...overrides,
  };
}

describe('mergeMetadataTaskProgress', () => {
  it('retains ISBN phase when polling sends an in-progress payload without phase', () => {
    const existing = progress({phase: MetadataBatchPhase.ISBN_DISCOVERY});
    const polled = progress({message: 'Still working', phase: null});

    expect(mergeMetadataTaskProgress(existing, polled).phase)
      .toBe(MetadataBatchPhase.ISBN_DISCOVERY);
  });

  it('retains metadata phase when the terminal payload omits phase', () => {
    const existing = progress({phase: MetadataBatchPhase.METADATA_FETCH});
    const completed = progress({
      completed: 1,
      message: 'Done',
      status: MetadataBatchStatus.COMPLETED,
      phase: null,
    });

    const merged = mergeMetadataTaskProgress(existing, completed);

    expect(merged.phase).toBe(MetadataBatchPhase.METADATA_FETCH);
    expect(merged.cancellationRequested).toBe(false);
  });

  it('uses a newer explicit phase', () => {
    const existing = progress({phase: MetadataBatchPhase.ISBN_DISCOVERY});
    const metadata = progress({phase: MetadataBatchPhase.METADATA_FETCH});

    expect(mergeMetadataTaskProgress(existing, metadata).phase)
      .toBe(MetadataBatchPhase.METADATA_FETCH);
  });
});

describe('MetadataProgressService dismissal', () => {
  let service: MetadataProgressService;

  afterEach(() => {
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('ignores later updates for a dismissed task without deleting backend state', () => {
    TestBed.configureTestingModule({
      providers: [
        MetadataProgressService,
        {
          provide: MetadataTaskService,
          useValue: {getActiveTasks: () => of([])},
        },
        {
          provide: UserService,
          useValue: {
            userState$: of({
              user: {permissions: {admin: true, canEditMetadata: true}},
            }),
          },
        },
      ],
    });
    service = TestBed.inject(MetadataProgressService);
    const task = progress({review: true, status: MetadataBatchStatus.COMPLETED});

    service.handleIncomingProgress(task);
    service.dismissTask(task.taskId);
    service.handleIncomingProgress({...task, message: 'Polled again'});

    expect(service.getActiveTasks()).toEqual({});
  });
});
