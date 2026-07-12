import {inject, Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../../../shared/service/failure-notification.service';
import {TranslocoService} from '@jsverse/transloco';
import {
  Annotation,
  AnnotationService,
  AnnotationStyle,
  CreateAnnotationRequest
} from '../../../../../shared/service/annotation.service';
import {Annotation as ViewAnnotation, ReaderAnnotationService} from './annotation-renderer.service';

@Injectable()
export class ReaderAnnotationHttpService {
  private annotationService = inject(AnnotationService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);
  private readerAnnotationService = inject(ReaderAnnotationService);

  private currentChapterTitle: string | null = null;

  updateCurrentChapter(chapterTitle: string): void {
    this.currentChapterTitle = chapterTitle;
  }

  createAnnotation(
    bookId: number,
    cfi: string,
    text: string,
    color = '#FACC15',
    style: AnnotationStyle = 'highlight',
    note?: string
  ): Observable<Annotation | null> {
    const request: CreateAnnotationRequest = {
      bookId,
      cfi,
      text,
      color,
      style,
      note,
      chapterTitle: this.currentChapterTitle || undefined
    };

    return this.annotationService.createAnnotation(request).pipe(
      tap(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('readerEbook.toast.highlightAddedSummary'),
          detail: this.t.translate('readerEbook.toast.highlightAddedDetail')
        });
      }),
      catchError(error => {
        const isDuplicate = error?.status === 409;
        if (isDuplicate) {
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('readerEbook.toast.highlightExistsSummary'),
            detail: this.t.translate('readerEbook.toast.highlightExistsDetail')
          });
        } else {
          this.toastError(
            this.t.translate('readerEbook.toast.highlightFailedSummary'),
            this.t.translate('readerEbook.toast.highlightFailedDetail')
          );
        }
        return of(null);
      })
    );
  }

  getAnnotations(bookId: number): Observable<Annotation[]> {
    return this.annotationService.getAnnotationsForBook(bookId).pipe(
      catchError(() => {
        return of([]);
      })
    );
  }

  deleteAnnotation(annotationId: number): Observable<boolean> {
    return this.annotationService.deleteAnnotation(annotationId).pipe(
      map(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('readerEbook.toast.highlightRemovedSummary'),
          detail: this.t.translate('readerEbook.toast.highlightRemovedDetail')
        });
        return true;
      }),
      catchError(() => {
        this.toastError(this.t.translate('readerEbook.toast.highlightRemoveFailedSummary'), this.t.translate('readerEbook.toast.highlightRemoveFailedDetail'));
        return of(false);
      })
    );
  }

  updateAnnotationNote(annotationId: number, note: string): Observable<Annotation | null> {
    return this.annotationService.updateAnnotation(annotationId, {note}).pipe(
      tap(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('readerEbook.toast.noteAnnotationUpdatedSummary'),
          detail: this.t.translate('readerEbook.toast.noteAnnotationUpdatedDetail')
        });
      }),
      catchError(() => {
        this.toastError(this.t.translate('readerEbook.toast.noteAnnotationUpdateFailedSummary'), this.t.translate('readerEbook.toast.noteAnnotationUpdateFailedDetail'));
        return of(null);
      })
    );
  }

  toViewAnnotations(annotations: Annotation[]): ViewAnnotation[] {
    return annotations.map(a => ({
      value: a.cfi,
      color: a.color,
      style: a.style
    }));
  }

  reset(): void {
    this.currentChapterTitle = null;
    this.readerAnnotationService.resetAnnotations();
  }

  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }
}
