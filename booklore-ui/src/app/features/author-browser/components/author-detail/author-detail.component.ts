import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AsyncPipe, NgClass} from '@angular/common';
import {Observable, Subscription} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {Tab, TabList, TabPanel, TabPanels, Tabs} from 'primeng/tabs';
import {ProgressSpinner} from 'primeng/progressspinner';
import {Button} from 'primeng/button';
import {Tag} from 'primeng/tag';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {injectVirtualGrid} from '../../../../shared/util/virtual-grid.util';
import {MessageService} from 'primeng/api';
import {Tooltip} from 'primeng/tooltip';
import {AuthorService} from '../../service/author.service';
import {AuthorDetails} from '../../model/author.model';
import {BookService} from '../../../book/service/book.service';
import {Book} from '../../../book/model/book.model';
import {BookCardComponent} from '../../../book/components/book-browser/book-card/book-card.component';
import {CoverScalePreferenceService} from '../../../book/components/book-browser/cover-scale-preference.service';
import {BookCardOverlayPreferenceService} from '../../../book/components/book-browser/book-card-overlay-preference.service';
import {UserService} from '../../../settings/user-management/user.service';
import {AuthorMatchComponent} from '../author-match/author-match.component';
import {AuthorEditorComponent} from '../author-editor/author-editor.component';
import {PageTitleService} from '../../../../shared/service/page-title.service';

@Component({
  selector: 'app-author-detail',
  standalone: true,
  templateUrl: './author-detail.component.html',
  styleUrls: ['./author-detail.component.scss'],
  imports: [
    AsyncPipe,
    NgClass,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    ProgressSpinner,
    Button,
    Tag,
    TranslocoDirective,
    Tooltip,
    BookCardComponent,
    AuthorMatchComponent,
    AuthorEditorComponent
  ]
})
export class AuthorDetailComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authorService = inject(AuthorService);
  private bookService = inject(BookService);
  private messageService = inject(MessageService);
  protected coverScalePreferenceService = inject(CoverScalePreferenceService);
  protected bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);
  protected userService = inject(UserService);
  private pageTitle = inject(PageTitleService);
  private t = inject(TranslocoService);

  private readonly GRID_GAP_MOBILE = 8;
  private readonly GRID_GAP_DESKTOP = 20.8;

  @ViewChild('descriptionContent') descriptionContentRef?: ElementRef<HTMLElement>;
  private _scrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('scrollContainer')
  set scrollContainer(el: ElementRef<HTMLElement> | undefined) {
    this._scrollContainer = el;
    this.updateVirtualGridDomBindings();
  }
  get scrollContainer(): ElementRef<HTMLElement> | undefined {
    return this._scrollContainer;
  }

  private _gridContainer?: ElementRef<HTMLElement>;
  @ViewChild('gridContainer')
  set gridContainer(el: ElementRef<HTMLElement> | undefined) {
    this._gridContainer = el;
    this.updateVirtualGridDomBindings();
  }
  get gridContainer(): ElementRef<HTMLElement> | undefined {
    return this._gridContainer;
  }

  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;

  private authorBooksGridSub?: Subscription;

  private readonly gridItemCountSig = signal(0);
  private readonly cardWidthSig = signal(this.coverScalePreferenceService.currentCardSize.width);
  private readonly cardHeightSig = signal(this.coverScalePreferenceService.currentCardSize.height);
  private readonly gapSig = signal(this.GRID_GAP_DESKTOP);

  readonly virtualGrid = injectVirtualGrid(() => ({
    itemCount: this.gridItemCountSig(),
    cardWidth: this.cardWidthSig(),
    cardHeight: this.cardHeightSig(),
    gap: this.gapSig(),
    overscan: 5,
  }));

  author: AuthorDetails | null = null;
  loading = true;
  tab = 'books';
  isExpanded = false;
  isOverflowing = false;
  hasPhoto = true;
  photoTimestamp = Date.now();
  quickMatching = false;

  authorBooks$!: Observable<Book[]>;

  get currentCardSize() {
    return this.coverScalePreferenceService.currentCardSize;
  }

  get isMobile(): boolean {
    return this.screenWidth <= 767;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth = window.innerWidth;
    this.cardWidthSig.set(this.currentCardSize.width);
    this.cardHeightSig.set(this.currentCardSize.height);
    this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
    this.updateVirtualGridDomBindings();
  }

  get photoUrl(): string {
    if (!this.author) return '';
    return this.authorService.getAuthorPhotoUrl(this.author.id) + '&t=' + this.photoTimestamp;
  }

  get canEditMetadata(): boolean {
    const user = this.userService.getCurrentUser();
    return !!user?.permissions?.admin || !!user?.permissions?.canEditMetadata;
  }

  ngOnInit(): void {
    const authorId = Number(this.route.snapshot.paramMap.get('authorId'));
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam) {
      this.tab = tabParam;
    }
    this.loadAuthor(authorId);
  }

  ngAfterViewInit(): void {
    this.updateVirtualGridDomBindings();
  }

  ngAfterViewChecked(): void {
    if (!this.isExpanded && this.descriptionContentRef) {
      const el = this.descriptionContentRef.nativeElement;
      this.isOverflowing = el.scrollHeight > el.clientHeight;
    }
  }

  ngOnDestroy(): void {
    this.authorBooksGridSub?.unsubscribe();
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  onPhotoError(): void {
    this.hasPhoto = false;
  }

  onAuthorUpdated(updatedAuthor: AuthorDetails): void {
    this.author = updatedAuthor;
    this.hasPhoto = true;
    this.photoTimestamp = Date.now();
  }

  quickMatch(): void {
    if (!this.author || this.quickMatching) return;
    this.quickMatching = true;
    this.authorService.quickMatchAuthor(this.author.id).subscribe({
      next: (matched) => {
        this.onAuthorUpdated(matched);
        this.quickMatching = false;
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.quickMatchSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.quickMatchSuccessDetail')
        });
      },
      error: () => {
        this.quickMatching = false;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.quickMatchFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.quickMatchFailedDetail')
        });
      }
    });
  }

  closePage(): void {
    this.router.navigate(['/authors']);
  }

  private loadAuthor(authorId: number): void {
    this.authorService.getAuthorDetails(authorId).subscribe({
      next: (author) => {
        this.author = author;
        this.loading = false;
        this.pageTitle.setPageTitle(author.name);

        this.authorBooksGridSub?.unsubscribe();
        this.authorBooks$ = this.bookService.bookState$.pipe(
          filter(state => state.loaded && !!state.books),
          map(state => {
            const books = state.books || [];
            const name = author.name.toLowerCase();
            return books.filter(b =>
              b.metadata?.authors?.some(a => a.toLowerCase() === name)
            );
          })
        );
        this.authorBooksGridSub = this.authorBooks$.subscribe(books => {
          this.gridItemCountSig.set(books.length);
          this.cardWidthSig.set(this.currentCardSize.width);
          this.cardHeightSig.set(this.currentCardSize.height);
          this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
          queueMicrotask(() => this.updateVirtualGridDomBindings());
        });
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private updateVirtualGridDomBindings(): void {
    const scrollEl = this.scrollContainer?.nativeElement ?? null;
    this.virtualGrid.setScrollElement(scrollEl);

    const widthEl = this.gridContainer?.nativeElement ?? scrollEl;
    if (widthEl) {
      queueMicrotask(() => {
        if (widthEl.clientWidth > 0) {
          this.virtualGrid.setContainerWidth(widthEl.clientWidth);
        }
        if (scrollEl) {
          scrollEl.dispatchEvent(new Event('scroll'));
        }
      });
    }
  }
}
