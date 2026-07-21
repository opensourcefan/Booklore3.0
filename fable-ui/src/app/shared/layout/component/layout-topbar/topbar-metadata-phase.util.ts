import {
  MetadataBatchPhase,
  MetadataBatchProgressNotification
} from '../../../model/metadata-batch-progress.model';

export function toMetadataBatchPhase(
  phase: string | null | undefined
): MetadataBatchPhase | null {
  switch (phase) {
    case MetadataBatchPhase.ISBN_DISCOVERY:
    case MetadataBatchPhase.METADATA_FETCH:
    case MetadataBatchPhase.ISBN_FAILED:
      return phase;
    default:
      return null;
  }
}

export function selectTopbarMetadataPhase(
  tasks: Record<string, MetadataBatchProgressNotification>,
  displayedTaskId?: string
): MetadataBatchPhase | null {
  if (displayedTaskId) {
    return toMetadataBatchPhase(tasks[displayedTaskId]?.phase);
  }

  const latestIsbnTask = Object.values(tasks)
    .filter(task => toMetadataBatchPhase(task.phase) !== null)
    .sort((left, right) => right.completed - left.completed)[0];
  return toMetadataBatchPhase(latestIsbnTask?.phase);
}
