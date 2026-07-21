import {describe, expect, it} from 'vitest';
import {
  MetadataBatchPhase,
  MetadataBatchProgressNotification,
  MetadataBatchStatus
} from '../../../model/metadata-batch-progress.model';
import {selectTopbarMetadataPhase, toMetadataBatchPhase} from './topbar-metadata-phase.util';

function task(
  taskId: string,
  phase: MetadataBatchPhase | null,
  completed: number
): MetadataBatchProgressNotification {
  return {
    taskId,
    completed,
    total: 20,
    message: `${completed}/20`,
    status: MetadataBatchStatus.IN_PROGRESS,
    review: false,
    phase,
  };
}

describe('topbar metadata phase selection', () => {
  it('selects the displayed task phase instead of another concurrent task', () => {
    const tasks = {
      isbn: task('isbn', MetadataBatchPhase.ISBN_DISCOVERY, 1),
      metadata: task('metadata', MetadataBatchPhase.METADATA_FETCH, 8),
    };

    expect(selectTopbarMetadataPhase(tasks, 'isbn')).toBe(MetadataBatchPhase.ISBN_DISCOVERY);
  });

  it('falls back to the furthest-progressed ISBN task for recovered progress', () => {
    const tasks = {
      first: task('first', MetadataBatchPhase.ISBN_DISCOVERY, 2),
      second: task('second', MetadataBatchPhase.METADATA_FETCH, 9),
    };

    expect(selectTopbarMetadataPhase(tasks)).toBe(MetadataBatchPhase.METADATA_FETCH);
  });

  it('does not apply ISBN colors to ordinary metadata tasks', () => {
    const tasks = {
      ordinary: task('ordinary', null, 5),
    };

    expect(selectTopbarMetadataPhase(tasks, 'ordinary')).toBeNull();
    expect(toMetadataBatchPhase('UNKNOWN')).toBeNull();
  });
});
