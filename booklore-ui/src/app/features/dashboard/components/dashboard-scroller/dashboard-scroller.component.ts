import {ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild, inject, OnDestroy} from '@angular/core';
import {BookCardComponent} from '../../../book/components/book-browser/book-card/book-card.component';
import {InfiniteScrollDirective} from 'ngx-infinite-scroll';
import {NgClass} from '@angular/common';

import {ProgressSpinnerModule} from 'primeng/progressspinner';
import {Book} from '../../../book/model/book.model';
import {ScrollerType} from '../../models/dashboard-config.model';
import { BookCardOverlayPreferenceService } from '../../../book/components/book-browser/book-card-overlay-preference.service';
import {TranslocoDirective} from '@jsverse/transloco';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';
import {Subscription} from 'rxjs';

@Component({
  selector: 'app-dashboard-scroller',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-scroller.component.html',
  styleUrls: ['./dashboard-scroller.component.scss'],
  imports: [
    InfiniteScrollDirective,
    BookCardComponent,
    ProgressSpinnerModule,
    NgClass,
    TranslocoDirective
  ],
  standalone: true
})
export class DashboardScrollerComponent implements OnInit, OnDestroy {

  @Input() bookListType: ScrollerType | null = null;
  @Input() title!: string;
  @Input() books!: Book[] | null;
  @Input() isMagicShelf = false;
  @Input() useSquareCovers = false;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  openMenuBookId: number | null = null;
  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  mobileTitleRows = 2;
  desktopTitleRows = 2;

  private readonly MOBILE_BREAKPOINT = 767;
  private readonly MOBILE_TITLE_ROWS_STORAGE_KEY = 'mobileTitleRowsPreference';
  private readonly DESKTOP_TITLE_ROWS_STORAGE_KEY = 'desktopTitleRowsPreference';

  public bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly mobileUx = inject(MobileUxService);
  private resizeSub?: Subscription;

  ngOnInit(): void {
    this.loadTitleRowsPreference();
    this.resizeSub = this.mobileUx.screenWidth$.subscribe(width => {
      this.screenWidth = width;
    });
  }

  ngOnDestroy(): void {
    this.resizeSub?.unsubscribe();
  }

  get titleRowsForViewport(): number {
    return this.screenWidth <= this.MOBILE_BREAKPOINT ? this.mobileTitleRows : this.desktopTitleRows;
  }

  get forceEbookMode(): boolean {
    return this.bookListType === ScrollerType.LAST_READ;
  }

  handleMenuToggle(bookId: number, isOpen: boolean) {
    this.openMenuBookId = isOpen ? bookId : null;
  }

  private loadTitleRowsPreference(): void {
    const savedMobileRows = this.localStorageService.get<number>(this.MOBILE_TITLE_ROWS_STORAGE_KEY);
    const savedDesktopRows = this.localStorageService.get<number>(this.DESKTOP_TITLE_ROWS_STORAGE_KEY);

    if (savedMobileRows !== null) {
      this.mobileTitleRows = Math.min(3, Math.max(1, savedMobileRows));
    }
    if (savedDesktopRows !== null) {
      this.desktopTitleRows = Math.min(5, Math.max(1, savedDesktopRows));
    }
  }
}
