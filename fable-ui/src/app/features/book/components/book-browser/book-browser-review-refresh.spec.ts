import {convertToParamMap} from '@angular/router';
import {Subject} from 'rxjs';
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
});
