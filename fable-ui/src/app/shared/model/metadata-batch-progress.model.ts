export enum MetadataBatchStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
}

export const MetadataBatchStatusLabels: Record<MetadataBatchStatus, string> = {
  [MetadataBatchStatus.IN_PROGRESS]: 'In Progress',
  [MetadataBatchStatus.COMPLETED]: 'Completed',
  [MetadataBatchStatus.ERROR]: 'Error',
  [MetadataBatchStatus.CANCELLED]: 'Cancelled',
};

/** Optional ISBN Discovery two-stage progress phases. */
export enum MetadataBatchPhase {
  ISBN_DISCOVERY = 'ISBN_DISCOVERY',
  METADATA_FETCH = 'METADATA_FETCH',
  ISBN_FAILED = 'ISBN_FAILED',
}

export interface MetadataBatchProgressNotification {
  taskId: string;
  completed: number;
  total: number;
  message: string;
  status: MetadataBatchStatus;
  review: boolean;
  resumable?: boolean;
  pendingCount?: number | null;
  cancellationRequested?: boolean;
  /** Present for ISBN Discovery tasks; omit for normal metadata refresh. */
  phase?: MetadataBatchPhase | string | null;
}
