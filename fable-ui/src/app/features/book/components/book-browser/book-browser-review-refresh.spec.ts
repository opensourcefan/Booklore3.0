import {convertToParamMap} from '@angular/router';
import {of, Subject} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {BookBrowserComponent, EntityType} from './book-browser.component';

describe('BookBrowserComponent metadata review refresh', () => {
  it('refreshes Staging triage after the review dialog closes', () => {
    const onClose = new Subject<void>();
    const refreshStagingTriage = vi.fn();
    const openMetadataReviewDialog = vi.fn(() => ({onClose}));
    const componentLike = {
      entityType: EntityType.STAGING,
      destroy$: new Subject<void>(),
      dialogLauncherService: {openMetadataReviewDialog},
      refreshStagingTriage,
    };

    const openMetadataReviewAndRefresh = (BookBrowserComponent.prototype as unknown as {
      openMetadataReviewAndRefresh: (taskId: string, initialBookId?: number) => void;
    }).openMetadataReviewAndRefresh;

    openMetadataReviewAndRefresh.call(componentLike, 'task-1', 42);
    expect(openMetadataReviewDialog).toHaveBeenCalledWith('task-1', 42);
    expect(refreshStagingTriage).not.toHaveBeenCalled();

    onClose.next();

    expect(refreshStagingTriage).toHaveBeenCalledOnce();
  });

  it('stores the active Staging section in the return URL query', () => {
    const navigate = vi.fn();
    const activatedRoute = {
      snapshot: {queryParamMap: convertToParamMap({})},
    };
    const componentLike = {
      activatedRoute,
      router: {navigate},
    };
    const syncStagingTriageModeQuery = (BookBrowserComponent.prototype as unknown as {
      syncStagingTriageModeQuery: (mode: 'staging' | 'completed' | 'review') => void;
    }).syncStagingTriageModeQuery;

    syncStagingTriageModeQuery.call(componentLike, 'completed');

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: activatedRoute,
      queryParams: {triage: 'completed'},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('returns Review to Staging when the refreshed review count reaches zero', () => {
    const syncStagingTriageModeQuery = vi.fn();
    const rebuildStagingBookState = vi.fn();
    const markForCheck = vi.fn();
    const componentLike = {
      metadataTaskService: {
        getStagingTriage: () => of({
          stagingCount: 0,
          completedCount: 0,
          reviewCount: 0,
          stagingBookIds: [],
          completedBookIds: [],
          reviewBookIds: [],
          reviewTasks: [],
        }),
      },
      destroy$: new Subject<void>(),
      stagingTriageMode: 'review',
      stagingInboxCount: 1,
      stagingCompletedCount: 0,
      pendingReviewCount: 1,
      stagingInboxBookIds: new Set([42]),
      stagingCompletedBookIds: new Set<number>(),
      pendingReviewBookIds: new Set([42]),
      pendingReviewTasks: [{taskId: 'task-1', proposalCount: 1, bookIds: [42]}],
      pendingReviewPrimaryTaskId: 'task-1',
      lastStagingTriageSignature: '',
      entityType: EntityType.STAGING,
      syncStagingTriageModeQuery,
      rebuildStagingBookState,
      cdr: {markForCheck},
    };

    const refreshStagingTriage = (BookBrowserComponent.prototype as unknown as {
      refreshStagingTriage: () => void;
    }).refreshStagingTriage;

    refreshStagingTriage.call(componentLike);

    expect(componentLike.stagingTriageMode).toBe('staging');
    expect(componentLike.pendingReviewCount).toBe(0);
    expect(componentLike.pendingReviewBookIds).toEqual(new Set());
    expect(syncStagingTriageModeQuery).toHaveBeenCalledWith('staging');
    expect(rebuildStagingBookState).toHaveBeenCalledOnce();
    expect(markForCheck).toHaveBeenCalledOnce();
  });
});
