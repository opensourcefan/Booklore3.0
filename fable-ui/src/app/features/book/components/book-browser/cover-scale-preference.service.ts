import {inject, Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {TranslocoService} from '@jsverse/transloco';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {Book} from '../../model/book.model';

@Injectable({
  providedIn: 'root'
})
export class CoverScalePreferenceService {

  private readonly BASE_WIDTH = 135;
  /** Matches book-card `.cover-container { aspect-ratio: 5/7 }` (height/width = 7/5). */
  private readonly COVER_ASPECT_RATIO = 7 / 5;
  /**
   * Fixed strip for one title row. Must NOT scale with cover size — title font is rem-based
   * (html $scale), so shrinking the card used to steal the last visible text row on tablets.
   */
  readonly TITLE_BAR_HEIGHT = 31;
  /** Extra height per additional title row beyond the first. */
  readonly TITLE_ROW_EXTRA_HEIGHT = 20;
  private readonly DEBOUNCE_MS = 1000;
  private readonly STORAGE_KEY = 'coverScalePreference';

  private readonly messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);
  private readonly localStorageService = inject(LocalStorageService);

  private readonly scaleChangeSubject = new Subject<number>();
  readonly scaleChange$ = this.scaleChangeSubject.asObservable();

  scaleFactor = 1.0;

  private toastError(summary: string, detail: string, life = 3000): void {
    this.messageService.add({severity: 'error', summary, detail, life});
    this.failureNotifications.reportSafe(summary, detail);
  }

  constructor() {
    this.loadScaleFromStorage();

    this.scaleChange$
      .pipe(debounceTime(this.DEBOUNCE_MS))
      .subscribe(scale => this.saveScalePreference(scale));
  }

  initScaleValue(scale: number | undefined): void {
    this.scaleFactor = scale ?? 1.0;
  }

  setScale(scale: number): void {
    this.scaleFactor = scale;
    this.scaleChangeSubject.next(scale);
  }

  get currentCardSize(): { width: number; height: number } {
    const width = Math.round(this.BASE_WIDTH * this.scaleFactor);
    const coverHeight = Math.round(width * this.COVER_ASPECT_RATIO);
    return {
      width,
      height: coverHeight + this.TITLE_BAR_HEIGHT,
    };
  }

  get gridColumnMinWidth(): string {
    return `${this.currentCardSize.width}px`;
  }

  getCardHeight(_book: Book): number {
    // Use uniform height for all book types to ensure smooth virtual scrolling.
    // Mixed heights cause choppy/jumpy scrolling because the virtual scroller
    // cannot accurately estimate positions when item heights vary.
    return this.currentCardSize.height;
  }

  /** Card height including room for the requested number of rem-based title rows. */
  getCardHeightForTitleRows(titleRows: number): number {
    const rows = Math.min(5, Math.max(1, titleRows || 1));
    return this.currentCardSize.height + (rows - 1) * this.TITLE_ROW_EXTRA_HEIGHT;
  }

  private saveScalePreference(scale: number): void {
    try {
      this.localStorageService.set(this.STORAGE_KEY, scale);
      this.messageService.add({
        severity: 'success',
        summary: this.t.translate('book.coverPref.toast.savedSummary'),
        detail: this.t.translate('book.coverPref.toast.savedDetail', {scale: scale.toFixed(2)}),
        life: 1500
      });
    } catch (_e) {
      this.toastError(this.t.translate('book.coverPref.toast.saveFailedSummary'), this.t.translate('book.coverPref.toast.saveFailedDetail'), 3000);
    }
  }

  private loadScaleFromStorage(): void {
    const saved = this.localStorageService.get<number>(this.STORAGE_KEY);
    if (saved !== null && !isNaN(saved)) {
      this.scaleFactor = saved;
    }
  }
}
