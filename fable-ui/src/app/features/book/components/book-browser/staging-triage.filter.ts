import {Book} from '../../model/book.model';
import {StagingTriageMode} from '../../service/metadata-task';

/**
 * Exclusive Staging triage filter used by the Staging browser tabs.
 */
export function filterBooksByStagingTriage(
  books: Book[] | null | undefined,
  mode: StagingTriageMode,
  inboxIds: Set<number>,
  completedIds: Set<number>,
  reviewIds: Set<number>,
): Book[] {
  const source = books || [];
  const allowedIds = mode === 'review'
    ? reviewIds
    : mode === 'completed'
      ? completedIds
      : inboxIds;

  // Until triage loads, keep the full staged set visible for the default Staging tab.
  if (mode === 'staging'
    && inboxIds.size === 0
    && completedIds.size === 0
    && reviewIds.size === 0) {
    return source;
  }

  return source.filter(book => allowedIds.has(book.id));
}
