import {inject, Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {BookMarkService} from '../../../../../shared/service/book-mark.service';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../../../shared/service/failure-notification.service';
import {TranslocoService} from '@jsverse/transloco';

@Injectable()
export class ReaderBookmarkService {
  private currentCFI: string | null = null;
  private currentChapterName: string | null = null;

  private bookMarkService = inject(BookMarkService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);


  updateCurrentPosition(cfi: string, chapterName?: string): void {
    this.currentCFI = cfi;
    if (chapterName) {
      this.currentChapterName = chapterName;
    }
  }

  createBookmarkAtCurrentPosition(bookId: number): Observable<boolean> {
    const cfi = this.currentCFI;
    if (!cfi) {
      return of(false);
    }

    const title = this.currentChapterName || 'Bookmark';

    return this.bookMarkService.createBookmark({bookId, cfi, title}).pipe(
      map(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('readerEbook.toast.bookmarkAddedSummary'),
          detail: this.t.translate('readerEbook.toast.bookmarkAddedDetail')
        });
        return true;
      }),
      catchError(error => {
        const isDuplicate = error?.status === 409;
        if (isDuplicate) {
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('readerEbook.toast.bookmarkExistsSummary'),
            detail: this.t.translate('readerEbook.toast.bookmarkExistsDetail')
          });
        } else {
          this.toastError(
            this.t.translate('readerEbook.toast.bookmarkFailedSummary'),
            this.t.translate('readerEbook.toast.bookmarkFailedDetail')
          );
        }
        return of(false);
      })
    );
  }

  reset(): void {
    this.currentCFI = null;
    this.currentChapterName = null;
  }

  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }
}
