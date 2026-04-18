import {AfterViewInit, ApplicationRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, inject, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild} from '@angular/core';
import {CdkPortal, DomPortalOutlet, PortalModule} from '@angular/cdk/portal';
import {TooltipModule} from "primeng/tooltip";
import {AdditionalFile, Book, BookType, ReadStatus} from '../../../model/book.model';
import {Button} from 'primeng/button';
import {MenuModule} from 'primeng/menu';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {BookService} from '../../../service/book.service';
import {BookFileService} from '../../../service/book-file.service';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {CheckboxChangeEvent, CheckboxModule} from 'primeng/checkbox';
import {FormsModule} from '@angular/forms';
import {MetadataRefreshType} from '../../../../metadata/model/request/metadata-refresh-type.enum';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {NgClass} from '@angular/common';
import {User, UserService} from '../../../../settings/user-management/user.service';
import {filter, Subject, Subscription} from 'rxjs';
import {EmailService} from '../../../../settings/email-v2/email.service';
import {TieredMenu} from 'primeng/tieredmenu';
import {Router} from '@angular/router';
import {RouterLink} from '@angular/router';
import {ProgressBar} from 'primeng/progressbar';
import {take, takeUntil} from 'rxjs/operators';
import {readStatusLabels} from '../book-filter/book-filter.config';
import {ResetProgressTypes} from '../../../../../shared/constants/reset-progress-type';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookDialogHelperService} from '../book-dialog-helper.service';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {BookNavigationService} from '../../../service/book-navigation.service';
import {BookCardOverlayPreferenceService} from '../book-card-overlay-preference.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-book-card',
  templateUrl: './book-card.component.html',
  styleUrls: ['./book-card.component.scss'],
  imports: [Button, MenuModule, CheckboxModule, FormsModule, NgClass, TieredMenu, ProgressBar, TooltipModule, RouterLink, TranslocoPipe, PortalModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookCardComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  private readonly MOBILE_BREAKPOINT = 768;
  private readonly MOBILE_LONG_EDGE_MAX_PX = 1200;
  private readonly VIEWER_SWIPE_THRESHOLD_PX = 48;
  private bodyScrollLockState: {
    bodyOverflow: string;
    bodyTouchAction: string;
    htmlOverflow: string;
    htmlTouchAction: string;
  } | null = null;
  private previewPortalHost: HTMLElement | null = null;
  private previewPortalOutlet: DomPortalOutlet | null = null;

  @Output() bookClicked = new EventEmitter<Book>();
  @Output() bookHoverEnded = new EventEmitter<number>();
  @Output() checkboxClick = new EventEmitter<{ index: number; book: Book; selected: boolean; shiftKey: boolean }>();
  @Output() menuToggled = new EventEmitter<boolean>();
  @Output() titleAreaActivated = new EventEmitter<Book>();

  @Input() index!: number;
  @Input() book!: Book;
  @Input() isCheckboxEnabled = false;
  @Input() isSelected = false;
  @Input() bottomBarHidden = false;
  @Input() seriesViewEnabled = false;
  @Input() isSeriesCollapsed = false;
  @Input() overlayPreferenceService?: BookCardOverlayPreferenceService;
  @Input() forceEbookMode = false;
  @Input() useSquareCovers = false;
  @Input() titleRows = 1;
  @Input() showSubtitle = false;
  @Input() forceFileNameTitle = false;
  @Input() titleAreaInteractive = false;
  @Input() mobileViewerBooksContext: Book[] | null = null;

  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  screenHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  inlineMobileViewerBooks: Book[] = [];
  inlineMobileViewerIndex = -1;

  private inlineViewerTouchStartX = 0;
  private inlineViewerTouchStartY = 0;
  private inlineViewerTouchMoved = false;

  @ViewChild('checkboxElem') checkboxElem!: ElementRef<HTMLInputElement>;
  @ViewChild('coverImg') private coverImgRef?: ElementRef<HTMLImageElement>;
  @ViewChild('menuTrigger', {read: ElementRef}) private menuTriggerRef?: ElementRef<HTMLElement>;
  @ViewChild('readStatusTrigger', {read: ElementRef}) private readStatusTriggerRef?: ElementRef<HTMLElement>;
  @ViewChild(CdkPortal) private previewPortal?: CdkPortal;

  items: MenuItem[] | undefined;
  readStatusMenuItems: MenuItem[] = [];
  isImageLoaded = false;
  isSubMenuLoading = false;
  private additionalFilesLoaded = false;

  private bookService = inject(BookService);
  private bookFileService = inject(BookFileService);
  private bookMetadataManageService = inject(BookMetadataManageService);
  private taskHelperService = inject(TaskHelperService);
  private userService = inject(UserService);
  private emailService = inject(EmailService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  protected urlHelper = inject(UrlHelperService);
  private confirmationService = inject(ConfirmationService);
  private bookDialogHelperService = inject(BookDialogHelperService);
  private bookNavigationService = inject(BookNavigationService);
  private cdr = inject(ChangeDetectorRef);
  private appSettingsService = inject(AppSettingsService);
  private readonly t = inject(TranslocoService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(Injector);

  protected _progressPercentage: number | null = null;
  protected _koProgressPercentage: number | null = null;
  protected _koboProgressPercentage: number | null = null;
  protected _displayTitle: string | undefined = undefined;
  protected _isSeriesViewActive = false;
  protected _coverImageUrl = '';
  protected _readStatusIcon = '';
  protected _readStatusClass = '';
  protected _readStatusTooltip = '';
  protected _shouldShowStatusIcon = false;
  protected _seriesCountTooltip = '';
  protected _titleTooltip = '';
  protected _hasProgress = false;
  protected _isAudiobook = false;
  protected _progressTooltip = '';
  protected _isContinueReading = false;
  protected _readButtonIcon = 'pi pi-book';

  private metadataCenterViewMode: 'route' | 'dialog' = 'route';
  private destroy$ = new Subject<void>();
  protected readStatusHelper = inject(ReadStatusHelper);
  private user: User | null = null;
  private diskType = 'LOCAL';
  private allowFileDeletion = false;
  private menuInitialized = false;

  showBookTypePill = true;
  showAiPanelDataOverlay = true;
  showIssueNumberOverlay = true;

  private overlayPrefSub?: Subscription;

  ngOnInit(): void {
    this.computeAllMemoizedValues();
    this.userService.userState$
      .pipe(
        filter(userState => !!userState?.user && userState.loaded),
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe(userState => {
        this.user = userState.user;
        this.metadataCenterViewMode = userState.user?.userSettings?.metadataCenterViewMode ?? 'route';
      });

    this.appSettingsService.appSettings$
      .pipe(
        filter(settings => !!settings),
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe(settings => {
        this.diskType = settings?.diskType ?? 'LOCAL';
        this.allowFileDeletion = settings?.allowFileDeletion ?? false;
      });

    if (this.overlayPreferenceService) {
      this.overlayPrefSub = new Subscription();
      this.overlayPrefSub.add(this.overlayPreferenceService.showBookTypePill$.subscribe(val => {
        this.showBookTypePill = val;
        this.cdr.markForCheck();
      }));
      this.overlayPrefSub.add(this.overlayPreferenceService.showAiPanelData$.subscribe(val => {
        this.showAiPanelDataOverlay = val;
        this.cdr.markForCheck();
      }));
      this.overlayPrefSub.add(this.overlayPreferenceService.showIssueNumber$.subscribe(val => {
        this.showIssueNumberOverlay = val;
        this.cdr.markForCheck();
      }));
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['book']
      || changes['forceEbookMode']
      || changes['useSquareCovers']
      || changes['showSubtitle']
      || changes['forceFileNameTitle']
      || changes['seriesViewEnabled']
      || changes['isSeriesCollapsed']
    ) {
      this.computeAllMemoizedValues();
      if (changes['book'] && !changes['book'].firstChange && this.menuInitialized) {
        this.additionalFilesLoaded = false;
        this.initMenu();
      }
    }
  }

  private computeAllMemoizedValues(): void {
    this._progressPercentage = this.book.epubProgress?.percentage
      ?? this.book.pdfProgress?.percentage
      ?? this.book.cbxProgress?.percentage
      ?? null;

    this._koProgressPercentage = this.book.koreaderProgress?.percentage ?? null;
    this._koboProgressPercentage = this.book.koboProgress?.percentage ?? null;

    this._hasProgress = this._progressPercentage !== null || this._koProgressPercentage !== null || this._koboProgressPercentage !== null;

    this._isSeriesViewActive = this.seriesViewEnabled && !!this.book.seriesCount && this.book.seriesCount >= 1;
    this._displayTitle = this.resolveDisplayTitle();
    this._isAudiobook = this.book.primaryFile?.bookType === 'AUDIOBOOK' && !this.forceEbookMode;
    this._coverImageUrl = this._isAudiobook
      ? this.urlHelper.getAudiobookThumbnailUrl(this.book.id, this.book.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(this.book.id, this.book.metadata?.coverUpdatedOn);

    this._readStatusIcon = this.readStatusHelper.getReadStatusIcon(this.book.readStatus);
    this._readStatusClass = this.readStatusHelper.getReadStatusClass(this.book.readStatus);
    this._readStatusTooltip = this.readStatusHelper.getReadStatusTooltip(this.book.readStatus);
    this._shouldShowStatusIcon = this.readStatusHelper.shouldShowStatusIcon(this.book.readStatus);

    this._seriesCountTooltip = this.t.translate('book.card.alt.seriesCollapsed', { count: this.book.seriesCount });
    this._titleTooltip = this.t.translate('book.card.alt.titleTooltip', { title: this._displayTitle });

    const progressParts: string[] = [];
    if (this._progressPercentage !== null) {
      progressParts.push(`${this._progressPercentage}% (BookLore)`);
    }
    if (this._koProgressPercentage !== null) {
      progressParts.push(`${this._koProgressPercentage}% (KOReader)`);
    }
    if (this._koboProgressPercentage !== null) {
      progressParts.push(`${this._koboProgressPercentage}% (Kobo)`);
    }
    this._progressTooltip = progressParts.join(' | ');

    const maxProgress = Math.max(
      this._progressPercentage ?? 0,
      this._koProgressPercentage ?? 0,
      this._koboProgressPercentage ?? 0
    );
    this._isContinueReading = maxProgress > 0 && maxProgress < 100;

    if (this._isAudiobook) {
      this._readButtonIcon = this._isContinueReading ? 'pi pi-forward' : 'pi pi-play';
    } else {
      this._readButtonIcon = this._isContinueReading ? 'pi pi-forward' : 'pi pi-book';
    }
  }

  private resolveDisplayTitle(): string {
    const fileName = this.book.fileName?.trim() || this.book.primaryFile?.fileName?.trim() || '';
    if (this.forceFileNameTitle) {
      return fileName;
    }

    const collapsedSeriesName = this.isSeriesCollapsed ? this.book.metadata?.seriesName?.trim() : '';
    const metadataTitle = this.book.metadata?.title?.trim() || '';
    const metadataSubtitle = this.book.metadata?.subtitle?.trim() || '';

    if (!collapsedSeriesName && this.showSubtitle && metadataTitle && metadataSubtitle) {
      return `${metadataTitle} : ${metadataSubtitle}`;
    }

    return collapsedSeriesName || metadataTitle || fileName;
  }

  get hasProgress(): boolean {
    return this._hasProgress;
  }

  get seriesCountTooltip(): string {
    return this._seriesCountTooltip;
  }

  get titleTooltip(): string {
    return this._titleTooltip;
  }

  get readStatusTooltip(): string {
    return this._readStatusTooltip;
  }

  get progressTooltip(): string {
    return this._progressTooltip;
  }

  get readButtonIcon(): string {
    return this._readButtonIcon;
  }

  get displayTitle(): string | undefined {
    return this._displayTitle;
  }

  get coverImageUrl(): string {
    return this._coverImageUrl;
  }

  get normalizedTitleRows(): number {
    return Math.min(5, Math.max(1, this.titleRows || 1));
  }

  get isMobileInteractionMode(): boolean {
    const shortEdge = Math.min(this.screenWidth, this.screenHeight);
    const longEdge = Math.max(this.screenWidth, this.screenHeight);
    return shortEdge < this.MOBILE_BREAKPOINT && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
  }

  get shouldAutoMobileTitlePreview(): boolean {
    return this.isMobileInteractionMode;
  }

  get isTitleAreaInteractive(): boolean {
    return this.titleAreaInteractive || this.shouldAutoMobileTitlePreview;
  }

  get activeInlineMobileViewerBook(): Book | null {
    if (this.inlineMobileViewerIndex < 0 || this.inlineMobileViewerIndex >= this.inlineMobileViewerBooks.length) {
      return null;
    }

    return this.inlineMobileViewerBooks[this.inlineMobileViewerIndex] ?? null;
  }

  get isInlineMobilePreviewOpen(): boolean {
    return this.activeInlineMobileViewerBook !== null;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    if (!this.isMobileInteractionMode && this.isInlineMobilePreviewOpen) {
      this.closeInlineMobilePreview();
    }
  }

  private buildReadStatusMenuItems(): void {
    this.readStatusMenuItems = Object.entries(readStatusLabels).map(([status, label]) => ({
      label,
      command: () => {
        this.bookService.updateBookReadStatus(this.book.id, status as ReadStatus).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('book.card.toast.readStatusUpdatedSummary'),
              detail: this.t.translate('book.card.toast.readStatusUpdatedDetail', {label}),
              life: 2000
            });
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.card.toast.readStatusFailedSummary'),
              detail: this.t.translate('book.card.toast.readStatusFailedDetail'),
              life: 3000
            });
          }
        });
      }
    }));
  }

  toggleReadStatusMenu(event: Event, menu: TieredMenu): void {
    event.stopPropagation();
    if (this.readStatusMenuItems.length === 0) {
      this.buildReadStatusMenuItems();
    }
    menu.toggle(this.getPopupAnchorEvent(event, this.readStatusTriggerRef?.nativeElement));
  }

  ngAfterViewInit(): void {
    const img = this.coverImgRef?.nativeElement;
    if (img && img.complete && img.naturalWidth > 0) {
      this.isImageLoaded = true;
      this.cdr.markForCheck();
    }
  }

  onImageLoad(): void {
    this.isImageLoaded = true;
    this.cdr.markForCheck();
  }

  readBook(book: Book): void {
    if (this.forceEbookMode && book.primaryFile?.bookType === 'AUDIOBOOK') {
      const ebookType = this.getEbookType(book);
      if (ebookType) {
        this.bookService.readBook(book.id, undefined, ebookType);
        return;
      }
    }
    this.bookService.readBook(book.id);
  }

  private getEbookType(book: Book): BookType | undefined {
    if (book.epubProgress) return 'EPUB';
    if (book.pdfProgress) return 'PDF';
    if (book.cbxProgress) return 'CBX';
    const alternativeFormat = book.alternativeFormats?.find(f =>
      f.bookType && ['EPUB', 'PDF', 'CBX', 'FB2', 'MOBI', 'AZW3'].includes(f.bookType)
    );
    return alternativeFormat?.bookType;
  }

  onMenuShow(): void {
    this.menuToggled.emit(true);
  }

  onMenuHide(): void {
    this.menuToggled.emit(false);
  }

  onMenuToggle(event: Event, menu: TieredMenu): void {
    event.stopPropagation();
    if (!this.menuInitialized) {
      this.menuInitialized = true;
      this.initMenu();
      this.cdr.markForCheck();
    }

    menu.toggle(this.getPopupAnchorEvent(event, this.menuTriggerRef?.nativeElement));

    if (!this.additionalFilesLoaded && !this.isSubMenuLoading && this.needsAdditionalFilesData()) {
      this.isSubMenuLoading = true;
      this.cdr.markForCheck();
      this.bookService.getBookByIdFromAPI(this.book.id, true).subscribe({
        next: (book) => {
          this.book = book;
          this.additionalFilesLoaded = true;
          this.isSubMenuLoading = false;
          this.initMenu();
          this.cdr.markForCheck();
        },
        error: () => {
          this.isSubMenuLoading = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  private needsAdditionalFilesData(): boolean {
    if (this.additionalFilesLoaded) {
      return false;
    }
    const hasNoAlternativeFormats = !this.book.alternativeFormats || this.book.alternativeFormats.length === 0;
    const hasNoSupplementaryFiles = !this.book.supplementaryFiles || this.book.supplementaryFiles.length === 0;
    const canDownload = !!this.user?.permissions.canDownload;
    const canDeleteBook = !!this.user?.permissions.canDeleteBook;
    return (canDownload || canDeleteBook) && hasNoAlternativeFormats && hasNoSupplementaryFiles;
  }

  private getPopupAnchorEvent(event: Event, preferredTarget?: HTMLElement): Event {
    const anchor = this.resolvePopupAnchorElement(preferredTarget)
      ?? this.resolvePopupAnchorElement(event.currentTarget)
      ?? this.resolvePopupAnchorElement(event.target)
      ?? this.resolvePopupAnchorFromPath(event);

    if (!anchor) {
      return event;
    }

    return {
      currentTarget: anchor,
      target: anchor,
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation(),
    } as unknown as Event;
  }

  private resolvePopupAnchorElement(candidate: EventTarget | null | undefined): HTMLElement | null {
    if (!(candidate instanceof HTMLElement)) {
      return null;
    }

    if (candidate.matches('button, a, [role="button"], .p-button')) {
      return candidate;
    }

    return candidate.querySelector<HTMLElement>('button, a, [role="button"], .p-button');
  }

  private resolvePopupAnchorFromPath(event: Event): HTMLElement | null {
    if (typeof event.composedPath !== 'function') {
      return null;
    }

    for (const entry of event.composedPath()) {
      const anchor = this.resolvePopupAnchorElement(entry);
      if (anchor) {
        return anchor;
      }
    }

    return null;
  }

  private initMenu() {
    this.items = [
      {
        label: this.t.translate('book.card.menu.assignShelf'),
        icon: 'pi pi-folder',
        command: () => this.openShelfDialog()
      },
      {
        label: 'Assign Media Type',
        icon: 'pi pi-file',
        command: () => this.openBookTypeDialog()
      },
      {
        label: this.t.translate('book.card.menu.viewDetails'),
        icon: 'pi pi-info-circle',
        command: () => {
          setTimeout(() => {
            this.openBookInfo(this.book);
          }, 150);
        },
      },
      ...this.getPermissionBasedMenuItems(),
      ...this.moreMenuItems(),
    ];
  }

  private getPermissionBasedMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];

    if (this.user?.permissions.canDownload) {
      const hasAdditionalFiles = (this.book.alternativeFormats && this.book.alternativeFormats.length > 0) ||
        (this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0);

      if (hasAdditionalFiles) {
        const downloadItems = this.getDownloadMenuItems();
        items.push({
          label: this.t.translate('book.card.menu.download'),
          icon: 'pi pi-download',
          items: downloadItems
        });
      } else if (this.additionalFilesLoaded) {
        items.push({
          label: this.t.translate('book.card.menu.download'),
          icon: 'pi pi-download',
          command: () => {
            this.bookFileService.downloadFile(this.book);
          }
        });
      } else {
        items.push({
          label: this.t.translate('book.card.menu.download'),
          icon: this.isSubMenuLoading ? 'pi pi-spin pi-spinner' : 'pi pi-download',
          items: [{label: this.t.translate('book.card.menu.loading'), disabled: true}]
        });
      }
    }

    if (this.user?.permissions.canDeleteBook) {
      const hasAdditionalFiles = (this.book.alternativeFormats && this.book.alternativeFormats.length > 0) ||
        (this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0);

      if (hasAdditionalFiles) {
        const deleteItems = this.getDeleteMenuItems();
        if (deleteItems.length > 0) {
          items.push({
            label: this.t.translate('book.card.menu.delete'),
            icon: 'pi pi-trash',
            items: deleteItems
          });
        }
      } else if (this.additionalFilesLoaded) {
        items.push({
          label: this.t.translate('book.card.menu.delete'),
          icon: 'pi pi-trash',
          items: [
            ...(!this.allowFileDeletion ? [] : [{
              label: this.t.translate('book.card.menu.deleteFromDisk'),
              icon: 'pi pi-trash',
              command: () => {
                this.confirmationService.confirm({
                  message: this.t.translate('book.card.confirm.deleteBookMessage', {title: this.book.metadata?.title}),
                  header: this.t.translate('book.card.confirm.deleteBookHeader'),
                  icon: 'pi pi-exclamation-triangle',
                  acceptIcon: 'pi pi-trash',
                  rejectIcon: 'pi pi-times',
                  acceptLabel: this.t.translate('common.delete'),
                  rejectLabel: this.t.translate('common.cancel'),
                  acceptButtonStyleClass: 'p-button-danger',
                  rejectButtonStyleClass: 'p-button-outlined',
                  accept: () => {
                    this.bookService.deleteBooks(new Set([this.book.id]), true).subscribe();
                  }
                });
              }
            }]),
            {
              label: this.t.translate('book.card.menu.removeFromLibrary'),
              icon: 'pi pi-minus-circle',
              command: () => {
                this.confirmationService.confirm({
                  message: this.t.translate('book.card.confirm.removeFromLibraryMessage', {title: this.book.metadata?.title}),
                  header: this.t.translate('book.card.confirm.removeFromLibraryHeader'),
                  icon: 'pi pi-exclamation-triangle',
                  acceptIcon: 'pi pi-minus-circle',
                  rejectIcon: 'pi pi-times',
                  acceptLabel: this.t.translate('common.remove'),
                  rejectLabel: this.t.translate('common.cancel'),
                  acceptButtonStyleClass: 'p-button-warning',
                  rejectButtonStyleClass: 'p-button-outlined',
                  accept: () => {
                    this.bookService.deleteBooks(new Set([this.book.id]), false).subscribe();
                  }
                });
              }
            }
          ]
        });
      } else {
        items.push({
          label: this.t.translate('book.card.menu.delete'),
          icon: this.isSubMenuLoading ? 'pi pi-spin pi-spinner' : 'pi pi-trash',
          items: [{label: this.t.translate('book.card.menu.loading'), disabled: true}]
        });
      }
    }

    if (this.user?.permissions.canEmailBook) {
      items.push(
        {
          label: this.t.translate('book.card.menu.emailBook'),
          icon: 'pi pi-envelope',
          items: [{
            label: this.t.translate('book.card.menu.quickSend'),
            icon: 'pi pi-envelope',
            command: () => {
              const doSend = () => {
                this.emailService.emailBookQuick(this.book.id).subscribe({
                  next: () => {
                    this.messageService.add({
                      severity: 'info',
                      summary: this.t.translate('common.success'),
                      detail: this.t.translate('book.card.toast.quickSendSuccessDetail'),
                    });
                  },
                  error: (err) => {
                    const errorMessage = err?.error?.message || this.t.translate('book.card.toast.quickSendErrorDetail');
                    this.messageService.add({
                      severity: 'error',
                      summary: this.t.translate('common.error'),
                      detail: errorMessage,
                    });
                  },
                });
              };

              if (this.book.primaryFile?.fileSizeKb && this.book.primaryFile.fileSizeKb > 25 * 1024) {
                this.confirmationService.confirm({
                  message: this.t.translate('book.card.confirm.largeFileMessage'),
                  header: this.t.translate('book.card.confirm.largeFileHeader'),
                  icon: 'pi pi-exclamation-triangle',
                  acceptLabel: this.t.translate('book.card.confirm.sendAnyway'),
                  rejectLabel: this.t.translate('common.cancel'),
                  acceptButtonProps: { severity: 'warn' },
                  rejectButtonProps: { severity: 'secondary' },
                  accept: doSend,
                });
              } else {
                doSend();
              }
            }
          },
            {
              label: this.t.translate('book.card.menu.customSend'),
              icon: 'pi pi-envelope',
              command: () => {
                this.bookDialogHelperService.openCustomSendDialog(this.book);
              }
            }
          ]
        });
    }

    if (this.user?.permissions.canEditMetadata) {
      items.push({
        label: this.t.translate('book.card.menu.metadata'),
        icon: 'pi pi-database',
        items: [
          {
            label: this.t.translate('book.card.menu.searchMetadata'),
            icon: 'pi pi-sparkles',
            command: () => {
              setTimeout(() => {
                this.router.navigate(['/book', this.book.id], {
                  queryParams: {tab: 'match', returnTo: this.router.url}
                })
              }, 150);
            },
          },
          {
            label: this.t.translate('book.card.menu.autoFetch'),
            icon: 'pi pi-bolt',
            command: () => {
              this.taskHelperService.refreshMetadataTask({
                refreshType: MetadataRefreshType.BOOKS,
                bookIds: [this.book.id],
              }).subscribe();
            }
          },
          {
            label: this.t.translate('book.card.menu.customFetch'),
            icon: 'pi pi-sync',
            command: () => {
              this.bookDialogHelperService.openMetadataRefreshDialog(new Set([this.book!.id]))
            },
          },
          {
            label: this.t.translate('book.card.menu.regenerateCover'),
            icon: 'pi pi-image',
            command: () => {
              this.bookMetadataManageService.regenerateCover(this.book.id).subscribe({
                next: () => this.messageService.add({
                  severity: 'success',
                  summary: this.t.translate('common.success'),
                  detail: this.t.translate('book.card.toast.coverRegenSuccessDetail')
                }),
                error: (err) => this.messageService.add({
                  severity: 'error',
                  summary: this.t.translate('common.error'),
                  detail: err?.error?.message || this.t.translate('book.card.toast.coverRegenFailedDetail')
                })
              });
            }
          },
          {
            label: this.t.translate('book.card.menu.generateCustomCover'),
            icon: 'pi pi-palette',
            command: () => {
              this.bookMetadataManageService.generateCustomCover(this.book.id).subscribe({
                next: () => this.messageService.add({
                  severity: 'success',
                  summary: this.t.translate('common.success'),
                  detail: this.t.translate('book.card.toast.customCoverSuccessDetail')
                }),
                error: (err) => this.messageService.add({
                  severity: 'error',
                  summary: this.t.translate('common.error'),
                  detail: err?.error?.message || this.t.translate('book.card.toast.customCoverFailedDetail')
                })
              });
            }
          }
        ]
      });
    }

    return items;
  }

  private moreMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];
    const moreActions: MenuItem[] = [];

    if (this.user?.permissions.canMoveOrganizeFiles && this.diskType === 'LOCAL') {
      moreActions.push({
        label: this.t.translate('book.card.menu.organizeFile'),
        icon: 'pi pi-arrows-h',
        command: () => {
          this.bookDialogHelperService.openFileMoverDialog(new Set([this.book.id]));
        }
      });
    }

    moreActions.push(
      {
        label: this.t.translate('book.card.menu.readStatus'),
        icon: 'pi pi-book',
        items: Object.entries(readStatusLabels).map(([status, label]) => ({
          label,
          command: () => {
            this.bookService.updateBookReadStatus(this.book.id, status as ReadStatus).subscribe({
              next: () => {
                this.messageService.add({
                  severity: 'success',
                  summary: this.t.translate('book.card.toast.readStatusUpdatedSummary'),
                  detail: this.t.translate('book.card.toast.readStatusUpdatedDetail', {label}),
                  life: 2000
                });
              },
              error: () => {
                this.messageService.add({
                  severity: 'error',
                  summary: this.t.translate('book.card.toast.readStatusFailedSummary'),
                  detail: this.t.translate('book.card.toast.readStatusFailedDetail'),
                  life: 3000
                });
              }
            });
          }
        }))
      },
      {
        label: this.t.translate('book.card.menu.resetBookloreProgress'),
        icon: 'pi pi-undo',
        command: () => {
          this.bookService.resetProgress(this.book.id, ResetProgressTypes.BOOKLORE).subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: this.t.translate('book.card.toast.progressResetSummary'),
                detail: this.t.translate('book.card.toast.progressResetBookloreDetail'),
                life: 1500
              });
            },
            error: () => {
              this.messageService.add({
                severity: 'error',
                summary: this.t.translate('book.card.toast.progressResetFailedSummary'),
                detail: this.t.translate('book.card.toast.progressResetBookloreFailedDetail'),
                life: 1500
              });
            }
          });
        },
      },
      {
        label: this.t.translate('book.card.menu.resetKOReaderProgress'),
        icon: 'pi pi-undo',
        command: () => {
          this.bookService.resetProgress(this.book.id, ResetProgressTypes.KOREADER).subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: this.t.translate('book.card.toast.progressResetSummary'),
                detail: this.t.translate('book.card.toast.progressResetKOReaderDetail'),
                life: 1500
              });
            },
            error: () => {
              this.messageService.add({
                severity: 'error',
                summary: this.t.translate('book.card.toast.progressResetFailedSummary'),
                detail: this.t.translate('book.card.toast.progressResetKOReaderFailedDetail'),
                life: 1500
              });
            }
          });
        },
      }
    );

    items.push({
      label: this.t.translate('book.card.menu.moreActions'),
      icon: 'pi pi-ellipsis-h',
      items: moreActions
    });

    return items;
  }

  private openShelfDialog(): void {
    this.bookDialogHelperService.openShelfAssignerDialog(this.book, null);
  }

  private openBookTypeDialog(): void {
    this.bookDialogHelperService.openBookTypeAssignerDialog(this.book, null);
  }

  openSeriesInfo(): void {
    const seriesName = this.book?.metadata?.seriesName;
    if (this.isSeriesCollapsed && seriesName) {
      const encodedSeriesName = encodeURIComponent(seriesName);
      this.router.navigate(['/series', encodedSeriesName]);
    } else {
      this.openBookInfo(this.book);
    }
  }

  openBookInfo(book: Book): void {
    const allBookIds = this.bookNavigationService.getAvailableBookIds();
    if (allBookIds.length > 0) {
      this.bookNavigationService.setNavigationContext(allBookIds, book.id);
    }

    if (this.metadataCenterViewMode === 'route') {
      this.router.navigate(['/book', book.id], {
        queryParams: {tab: 'view', returnTo: this.router.url}
      });
    } else {
      this.bookDialogHelperService.openBookDetailsDialog(book.id);
    }
  }

  private getDownloadMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];

    items.push({
      label: `${this.book.fileName || 'Book File'}`,
      icon: 'pi pi-file',
      command: () => {
        this.bookFileService.downloadFile(this.book);
      }
    });

    if (this.hasAdditionalFiles()) {
      items.push({separator: true});
    }

    if (this.book.alternativeFormats && this.book.alternativeFormats.length > 0) {
      this.book.alternativeFormats.forEach(format => {
        const extension = this.getFileExtension(format.filePath);
        items.push({
          label: `${format.fileName} (${this.getFileSizeInMB(format)})`,
          icon: this.getFileIcon(extension),
          command: () => this.downloadAdditionalFile(this.book, format.id)
        });
      });
    }

    if (this.book.alternativeFormats && this.book.alternativeFormats.length > 0 &&
      this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0) {
      items.push({separator: true});
    }

    if (this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0) {
      this.book.supplementaryFiles.forEach(file => {
        const extension = this.getFileExtension(file.filePath);
        items.push({
          label: `${file.fileName} (${this.getFileSizeInMB(file)})`,
          icon: this.getFileIcon(extension),
          command: () => this.downloadAdditionalFile(this.book, file.id)
        });
      });
    }

    return items;
  }

  private getDeleteMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];

    if (this.allowFileDeletion) {
      items.push({
        label: this.t.translate('book.card.menu.deleteFromDisk'),
        icon: 'pi pi-trash',
        command: () => {
          this.confirmationService.confirm({
            message: this.t.translate('book.card.confirm.deleteBookMessage', {title: this.book.metadata?.title}),
            header: this.t.translate('book.card.confirm.deleteBookHeader'),
            icon: 'pi pi-exclamation-triangle',
            acceptIcon: 'pi pi-trash',
            rejectIcon: 'pi pi-times',
            acceptLabel: this.t.translate('common.delete'),
            rejectLabel: this.t.translate('common.cancel'),
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-outlined',
            accept: () => {
              this.bookService.deleteBooks(new Set([this.book.id]), true).subscribe();
            }
          });
        }
      });
    }

    items.push({
      label: this.t.translate('book.card.menu.removeFromLibrary'),
      icon: 'pi pi-minus-circle',
      command: () => {
        this.confirmationService.confirm({
          message: this.t.translate('book.card.confirm.removeFromLibraryMessage', {title: this.book.metadata?.title}),
          header: this.t.translate('book.card.confirm.removeFromLibraryHeader'),
          icon: 'pi pi-exclamation-triangle',
          acceptIcon: 'pi pi-minus-circle',
          rejectIcon: 'pi pi-times',
          acceptLabel: this.t.translate('common.remove'),
          rejectLabel: this.t.translate('common.cancel'),
          acceptButtonStyleClass: 'p-button-warning',
          rejectButtonStyleClass: 'p-button-outlined',
          accept: () => {
            this.bookService.deleteBooks(new Set([this.book.id]), false).subscribe();
          }
        });
      }
    });

    if (items.length > 0 && this.hasAdditionalFiles()) {
      items.push({separator: true});
    }

    if (this.book.alternativeFormats && this.book.alternativeFormats.length > 0) {
      this.book.alternativeFormats.forEach(format => {
        const extension = this.getFileExtension(format.filePath);
        items.push({
          label: `${format.fileName} (${this.getFileSizeInMB(format)})`,
          icon: this.getFileIcon(extension),
          command: () => this.deleteAdditionalFile(this.book.id, format.id, format.fileName || 'file')
        });
      });
    }

    if (this.book.alternativeFormats && this.book.alternativeFormats.length > 0 &&
      this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0) {
      items.push({separator: true});
    }

    if (this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0) {
      this.book.supplementaryFiles.forEach(file => {
        const extension = this.getFileExtension(file.filePath);
        items.push({
          label: `${file.fileName} (${this.getFileSizeInMB(file)})`,
          icon: this.getFileIcon(extension),
          command: () => this.deleteAdditionalFile(this.book.id, file.id, file.fileName || 'file')
        });
      });
    }

    return items;
  }

  private hasAdditionalFiles(): boolean {
    return !!(this.book.alternativeFormats && this.book.alternativeFormats.length > 0) ||
      !!(this.book.supplementaryFiles && this.book.supplementaryFiles.length > 0);
  }

  private downloadAdditionalFile(book: Book, fileId: number): void {
    this.bookFileService.downloadAdditionalFile(book, fileId);
  }

  private deleteAdditionalFile(bookId: number, fileId: number, fileName: string): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.card.confirm.deleteFileMessage', {fileName}),
      header: this.t.translate('book.card.confirm.deleteFileHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.bookFileService.deleteAdditionalFile(bookId, fileId).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.card.toast.deleteFileSuccessDetail', {fileName})
            });
          },
          error: (error) => {
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('book.card.toast.deleteFileErrorDetail', {error: error.message || 'Unknown error'})
            });
          }
        });
      }
    });
  }

  getFileExtension(filePath?: string): string | null {
    if (!filePath) return null;
    const parts = filePath.split('.');
    if (parts.length < 2) return null;
    return parts.pop()?.toUpperCase() || null;
  }

  getDisplayFormat(): string | null {
    if (!this.book?.primaryFile) {
      return 'PHY';
    }
    if (this.forceEbookMode && this.book.primaryFile?.bookType === 'AUDIOBOOK') {
      const ebookType = this.getEbookType(this.book);
      if (ebookType) {
        return ebookType;
      }
    }
    const ext = this.book?.primaryFile?.extension;
    if (ext) {
      return ext.toUpperCase();
    }
    return this.getFileExtension(this.book?.primaryFile?.filePath);
  }

  getDisplayIssueNumber(): string | null {
    const comicIssueNumber = this.book?.metadata?.comicMetadata?.issueNumber?.trim();
    if (comicIssueNumber) {
      return comicIssueNumber.startsWith('#') ? comicIssueNumber : `#${comicIssueNumber}`;
    }

    if (!this.book?.seriesCount && this.book?.metadata?.seriesNumber != null) {
      return `#${this.book.metadata.seriesNumber}`;
    }

    return null;
  }

  hasDigitalFile(): boolean {
    return !!this.book?.primaryFile;
  }

  private getFileIcon(fileType: string | null): string {
    if (!fileType) return 'pi pi-file';
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return 'pi pi-file-pdf';
      case 'epub':
      case 'mobi':
      case 'azw3':
      case 'fb2':
        return 'pi pi-book';
      case 'cbz':
      case 'cbr':
      case 'cbx':
        return 'pi pi-image';
      case 'audiobook':
      case 'm4b':
      case 'm4a':
      case 'mp3':
      case 'opus':
        return 'pi pi-headphones';
      default:
        return 'pi pi-file';
    }
  }

  private getFileSizeInMB(fileInfo: AdditionalFile): string {
    const sizeKb = fileInfo?.fileSizeKb;
    return sizeKb != null ? `${(sizeKb / 1024).toFixed(2)} MB` : '-';
  }

  private lastMouseEvent: MouseEvent | null = null;

  captureMouseEvent(event: MouseEvent): void {
    this.lastMouseEvent = event;
  }

  onCardClick(event: MouseEvent | KeyboardEvent): void {
    if (!event.ctrlKey) {
      return;
    }

    this.toggleCardSelection(!this.isSelected)
  }

  toggleCardSelection(selected: boolean): void {
    if (!this.isCheckboxEnabled) {
      return;
    }

    this.isSelected = selected;
    const shiftKey = this.lastMouseEvent?.shiftKey ?? false;

    this.checkboxClick.emit({
      index: this.index,
      book: this.book,
      selected: selected,
      shiftKey: shiftKey,
    });

    this.lastMouseEvent = null;
  }

  toggleSelection(event: CheckboxChangeEvent): void {
    this.toggleCardSelection(event.checked);
  }

  onTitleAreaActivate(event: Event): void {
    if (!this.isTitleAreaInteractive) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (this.titleAreaActivated.observed) {
      this.titleAreaActivated.emit(this.book);
      return;
    }

    if (this.shouldAutoMobileTitlePreview) {
      this.toggleInlineMobilePreview(this.book);
    }
  }

  openInlineMobilePreview(): void {
    this.toggleInlineMobilePreview(this.book);
  }

  toggleInlineMobilePreview(book: Book): void {
    if (!this.shouldAutoMobileTitlePreview) {
      return;
    }

    if (this.activeInlineMobileViewerBook?.id === book.id) {
      this.closeInlineMobilePreview();
      return;
    }

    const orderedBooks = this.resolveInlineViewerBooks();
    const nextIndex = orderedBooks.findIndex(candidate => candidate.id === book.id);

    if (nextIndex === -1) {
      return;
    }

    this.inlineMobileViewerBooks = orderedBooks;
    this.inlineMobileViewerIndex = nextIndex;
    this.resetInlineViewerTouch();
    this.lockBackgroundScroll();
    this.attachPreviewPortal();
    this.cdr.markForCheck();
  }

  closeInlineMobilePreview(): void {
    if (!this.isInlineMobilePreviewOpen) {
      return;
    }

    this.inlineMobileViewerBooks = [];
    this.inlineMobileViewerIndex = -1;
    this.resetInlineViewerTouch();
    this.unlockBackgroundScroll();
    this.detachPreviewPortal();
    this.cdr.markForCheck();
  }

  onInlineViewerTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    this.inlineViewerTouchStartX = touch.clientX;
    this.inlineViewerTouchStartY = touch.clientY;
    this.inlineViewerTouchMoved = false;
  }

  onInlineViewerTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    if (Math.abs(touch.clientX - this.inlineViewerTouchStartX) > 8 || Math.abs(touch.clientY - this.inlineViewerTouchStartY) > 8) {
      this.inlineViewerTouchMoved = true;
    }
  }

  onInlineViewerTouchEnd(event: TouchEvent): void {
    if (!this.inlineViewerTouchMoved || event.changedTouches.length !== 1) {
      this.resetInlineViewerTouch();
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.inlineViewerTouchStartX;
    const deltaY = Math.abs(touch.clientY - this.inlineViewerTouchStartY);

    if (Math.abs(deltaX) >= this.VIEWER_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > deltaY) {
      if (deltaX < 0) {
        this.showNextInlineViewerBook();
      } else {
        this.showPreviousInlineViewerBook();
      }
    }

    this.resetInlineViewerTouch();
  }

  onInlineViewerTouchCancel(): void {
    this.resetInlineViewerTouch();
  }

  getInlineViewerCoverUrl(book: Book): string {
    return book.primaryFile?.bookType === 'AUDIOBOOK'
      ? this.urlHelper.getAudiobookThumbnailUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);
  }

  getInlineViewerTitle(book: Book): string {
    return book.metadata?.title?.trim()
      || book.fileName?.trim()
      || book.primaryFile?.fileName?.trim()
      || 'Untitled';
  }

  getInlineViewerSubtitle(book: Book): string | null {
    const subtitle = book.metadata?.subtitle?.trim();
    return subtitle ? subtitle : null;
  }

  getInlineViewerDisplayFormat(book: Book): string {
    if (!book.primaryFile) {
      return 'PHY';
    }

    const extension = book.primaryFile.extension?.trim();
    if (extension) {
      return extension.toUpperCase();
    }

    return this.getFileExtension(book.primaryFile.filePath) ?? 'PHY';
  }

  getInlineViewerIssueNumber(book: Book): string | null {
    const comicIssueNumber = book.metadata?.comicMetadata?.issueNumber?.trim();
    if (comicIssueNumber) {
      return comicIssueNumber.startsWith('#') ? comicIssueNumber : `#${comicIssueNumber}`;
    }

    if (!book.seriesCount && book.metadata?.seriesNumber != null) {
      return `#${book.metadata.seriesNumber}`;
    }

    return null;
  }

  getInlineViewerReadStatusIcon(book: Book): string {
    return this.readStatusHelper.getReadStatusIcon(book.readStatus);
  }

  getInlineViewerReadStatusClass(book: Book): string {
    return this.readStatusHelper.getReadStatusClass(book.readStatus);
  }

  shouldShowInlineViewerStatus(book: Book): boolean {
    return this.readStatusHelper.shouldShowStatusIcon(book.readStatus);
  }

  private showPreviousInlineViewerBook(): void {
    if (this.inlineMobileViewerIndex <= 0) {
      return;
    }

    this.inlineMobileViewerIndex -= 1;
    this.cdr.markForCheck();
  }

  private showNextInlineViewerBook(): void {
    if (this.inlineMobileViewerIndex >= this.inlineMobileViewerBooks.length - 1) {
      return;
    }

    this.inlineMobileViewerIndex += 1;
    this.cdr.markForCheck();
  }

  private resetInlineViewerTouch(): void {
    this.inlineViewerTouchStartX = 0;
    this.inlineViewerTouchStartY = 0;
    this.inlineViewerTouchMoved = false;
  }

  private resolveInlineViewerBooks(): Book[] {
    const contextBooks = (this.mobileViewerBooksContext ?? []).filter(
      (candidate): candidate is Book => !!candidate && candidate.id != null
    );

    if (contextBooks.length) {
      return contextBooks;
    }

    return [this.book];
  }

  private lockBackgroundScroll(): void {
    if (this.bodyScrollLockState || typeof document === 'undefined') {
      return;
    }

    this.bodyScrollLockState = {
      bodyOverflow: document.body.style.overflow,
      bodyTouchAction: document.body.style.touchAction,
      htmlOverflow: document.documentElement.style.overflow,
      htmlTouchAction: document.documentElement.style.touchAction,
    };

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
  }

  private unlockBackgroundScroll(): void {
    if (!this.bodyScrollLockState || typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = this.bodyScrollLockState.bodyOverflow;
    document.body.style.touchAction = this.bodyScrollLockState.bodyTouchAction;
    document.documentElement.style.overflow = this.bodyScrollLockState.htmlOverflow;
    document.documentElement.style.touchAction = this.bodyScrollLockState.htmlTouchAction;
    this.bodyScrollLockState = null;
  }

  private attachPreviewPortal(): void {
    if (typeof document === 'undefined' || !this.previewPortal || this.previewPortalOutlet?.hasAttached()) {
      return;
    }

    if (!this.previewPortalHost) {
      this.previewPortalHost = document.createElement('div');
      this.previewPortalHost.className = 'book-card-mobile-preview-portal-host';
      document.body.appendChild(this.previewPortalHost);
    }

    if (!this.previewPortalOutlet) {
      this.previewPortalOutlet = new DomPortalOutlet(this.previewPortalHost, this.appRef, this.injector);
    }

    this.previewPortalOutlet.attach(this.previewPortal);
  }

  private detachPreviewPortal(): void {
    this.previewPortalOutlet?.detach();
    this.previewPortalOutlet?.dispose();
    this.previewPortalOutlet = null;
    this.previewPortalHost = null;
  }

  ngOnDestroy(): void {
    this.detachPreviewPortal();
    this.unlockBackgroundScroll();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.overlayPrefSub) {
      this.overlayPrefSub.unsubscribe();
    }
  }
}
