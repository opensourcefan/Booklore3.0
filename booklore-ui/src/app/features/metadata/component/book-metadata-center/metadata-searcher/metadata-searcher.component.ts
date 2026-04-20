import {Component, EventEmitter, inject, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges} from '@angular/core';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {MultiSelect} from 'primeng/multiselect';

import {FetchMetadataRequest} from '../../../model/request/fetch-metadata-request.model';
import {Book, BookMetadata} from '../../../../book/model/book.model';
import {AppSettings} from '../../../../../shared/model/app-settings.model';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';

import {BehaviorSubject, combineLatest, Observable, Subject, Subscription, takeUntil} from 'rxjs';
import {filter, switchMap, take} from 'rxjs/operators';
import {ActivatedRoute, Router} from '@angular/router';
import {AsyncPipe} from '@angular/common';
import {MetadataPickerComponent} from '../metadata-picker/metadata-picker.component';
import {BookMetadataService} from '../../../../book/service/book-metadata.service';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {BookNavigationService} from '../../../../book/service/book-navigation.service';
import {BookMetadataHostService} from '../../../../../shared/service/book-metadata-host.service';
import {UserService} from '../../../../settings/user-management/user.service';

@Component({
  selector: 'app-metadata-searcher',
  templateUrl: './metadata-searcher.component.html',
  styleUrls: ['./metadata-searcher.component.scss'],
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    InputText,
    MetadataPickerComponent,
    MultiSelect,
    AsyncPipe,
    Tooltip,
    TranslocoDirective
  ],
  standalone: true
})
export class MetadataSearcherComponent implements OnInit, OnDestroy, OnChanges {
  private static readonly COMICVINE_URL_SLUG_PATTERN = /comicvine\.gamespot\.com\/([^/?#]+)\/\d{4}-\d+/i;

  form: FormGroup;
  providers: string[] = [];
  allFetchedMetadata: BookMetadata[] = [];
  bookId!: number;
  loading = false;
  searchTriggered = false;

  @Input() book$!: Observable<Book | null>;
  @Input() isActiveTab = false;
  @Input() showNavigationButtons = false;
  @Input() disableNext = false;
  @Input() disablePrevious = false;
  @Input() currentBookPosition = 0;
  @Input() totalBooks = 0;

  @Output() nextBookClicked = new EventEmitter<void>();
  @Output() previousBookClicked = new EventEmitter<void>();

  selectedFetchedMetadata$ = new BehaviorSubject<BookMetadata | null>(null);
  detailLoading = false;

  private formBuilder = inject(FormBuilder);
  private bookMetadataService = inject(BookMetadataService);
  private appSettingsService = inject(AppSettingsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userService = inject(UserService);
  private bookNavigationService = inject(BookNavigationService);
  private metadataHostService = inject(BookMetadataHostService);
  private translocoService = inject(TranslocoService);

  private subscription: Subscription = new Subscription();
  private cancelRequest$ = new Subject<void>();
  private metadataCenterViewMode: 'route' | 'dialog' = 'route';

  appSettings$: Observable<AppSettings | null> = this.appSettingsService.appSettings$;
  navigationState$ = this.bookNavigationService.getNavigationState();

  providerCounts = new Map<string, number>();
  providerLoading = new Map<string, boolean>();
  selectedProviderFilters = new Set<string>(['all']);
  filteredMetadata: BookMetadata[] = [];
  providerFilterOptions: { label: string; value: string }[] = [];

  private metadataByProvider = new Map<string, BookMetadata[]>();
  private providerCompletionStatus = new Map<string, boolean>();
  private pendingAutoSearch = false;
  private readonly providerStorageKey = 'bl-metadata-searcher-providers';

  constructor() {
    this.form = this.formBuilder.group({
      provider: null,
      title: [''],
      author: [''],
      isbn: [''],
      sourceUrl: ['']
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isActiveTab']?.currentValue && this.pendingAutoSearch) {
      this.pendingAutoSearch = false;
      this.onSubmit();
    }
  }

  ngOnInit() {
    this.subscription.add(
      this.userService.userState$
        .pipe(
          filter(userState => !!userState?.user && userState.loaded),
          take(1)
        )
        .subscribe(userState => {
          this.metadataCenterViewMode = userState.user?.userSettings.metadataCenterViewMode ?? 'route';
        })
    );

    this.subscription.add(
      this.form.get('provider')!.valueChanges.subscribe((providers: string[] | null) => {
        this.saveProviderSelection(providers ?? []);
      })
    );

    this.subscription.add(
      this.form.get('sourceUrl')!.valueChanges.subscribe((sourceUrl: string | null) => {
        this.tryAutoFillFromSourceUrl(sourceUrl ?? '');
      })
    );

    this.subscription.add(
      this.appSettings$
        .pipe(filter(settings => !!settings))
        .subscribe(settings => {
          const providerSettings = settings!.metadataProviderSettings ?? {};
          this.providers = Object.entries(providerSettings)
            .filter(([_, value]) => !!value && typeof value === 'object' && 'enabled' in value && (value as { enabled: unknown }).enabled)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));

          const currentProviders = this.getSelectedProviders();
          const validProviders = currentProviders.filter((p: string) => this.providers.includes(p));
          const storedProviders = this.getStoredProviders();
          const validStoredProviders = storedProviders === null
            ? null
            : storedProviders.filter((p: string) => this.providers.includes(p));
          const nextProviders = validStoredProviders !== null
            ? validStoredProviders
            : validProviders.length > 0 ? validProviders : this.providers;

          if (!this.areProviderSelectionsEqual(currentProviders, nextProviders)) {
            this.form.patchValue({provider: nextProviders}, {emitEvent: false});
            this.saveProviderSelection(nextProviders);
          }
        })
    );

    this.subscription.add(
      this.route.paramMap
        .pipe(
          switchMap(params => {
            const bookId = +params.get('id')!;
            if (this.bookId !== bookId) {
              this.bookId = bookId;
              this.cancelRequest$.next();
              this.loading = false;
              this.allFetchedMetadata = [];
              this.filteredMetadata = [];
              this.providerCounts.clear();
              this.selectedFetchedMetadata$.next(null);
            }
            return combineLatest([this.book$, this.appSettings$]);
          }),
          filter(([book, settings]) => !!book && !!settings),
        )
        .subscribe(([book, settings]) => {
          const bookChanged = book!.id !== this.bookId;
          if (bookChanged) {
            this.resetFormFromBook(book!);
            if (settings!.autoBookSearch) {
              if (this.isActiveTab) {
                this.onSubmit();
              } else {
                this.pendingAutoSearch = true;
              }
            }
          } else {
            this.updateFormFromBook(book!);
          }
        })
    );
  }

  private resetFormFromBook(book: Book): void {
    this.selectedFetchedMetadata$.next(null);
    this.allFetchedMetadata = [];
    this.filteredMetadata = [];
    this.providerCounts.clear();
    this.metadataByProvider.clear();
    this.selectedProviderFilters = new Set(['all']);
    this.bookId = book.id;

    const formUpdate: Record<string, unknown> = {
      title: book.metadata?.title ?? '',
      author: book.metadata?.authors?.[0] ?? '',
      isbn: book.metadata?.isbn13 ?? book.metadata?.isbn10 ?? '',
      sourceUrl: book.metadata?.externalUrl ?? ''
    };

    this.form.patchValue(formUpdate);
  }

  private updateFormFromBook(book: Book): void {
    this.form.patchValue({
      title: book.metadata?.title ?? '',
      author: book.metadata?.authors?.[0] ?? '',
      isbn: book.metadata?.isbn13 ?? book.metadata?.isbn10 ?? '',
      sourceUrl: book.metadata?.externalUrl ?? ''
    });
  }

  ngOnDestroy(): void {
    this.cancelRequest$.next();
    this.cancelRequest$.complete();
    this.subscription.unsubscribe();
    this.selectedFetchedMetadata$.complete();
  }

  get isSearchEnabled(): boolean {
    const providerSelected = this.getSelectedProviders().length > 0;
    const title = this.form.get('title')?.value?.trim?.();
    const isbn = this.form.get('isbn')?.value?.trim?.();
    const sourceUrl = this.form.get('sourceUrl')?.value?.trim?.();
    return providerSelected && (title || isbn || sourceUrl);
  }

  canNavigatePrevious(): boolean {
    if (this.showNavigationButtons) {
      return !this.disablePrevious;
    }

    return this.bookNavigationService.canNavigatePrevious();
  }

  canNavigateNext(): boolean {
    if (this.showNavigationButtons) {
      return !this.disableNext;
    }

    return this.bookNavigationService.canNavigateNext();
  }

  navigatePrevious(): void {
    if (this.showNavigationButtons) {
      this.previousBookClicked.emit();
      return;
    }

    const previousBookId = this.bookNavigationService.getPreviousBookId();
    if (previousBookId) {
      this.navigateToBook(previousBookId);
    }
  }

  navigateNext(): void {
    if (this.showNavigationButtons) {
      this.nextBookClicked.emit();
      return;
    }

    const nextBookId = this.bookNavigationService.getNextBookId();
    if (nextBookId) {
      this.navigateToBook(nextBookId);
    }
  }

  getNavigationPosition(): string {
    if (this.showNavigationButtons && this.currentBookPosition > 0 && this.totalBooks > 0) {
      return this.translocoService.translate('metadata.viewer.navigationPosition', {
        current: this.currentBookPosition,
        total: this.totalBooks,
      });
    }

    const position = this.bookNavigationService.getCurrentPosition();
    return position
      ? this.translocoService.translate('metadata.viewer.navigationPosition', {
        current: position.current,
        total: position.total,
      })
      : '';
  }

  getPreviousBookTooltip(): string {
    return this.translocoService.translate('metadata.viewer.goToPreviousBook');
  }

  getNextBookTooltip(): string {
    return this.translocoService.translate('metadata.viewer.goToNextBook');
  }

  private navigateToBook(bookId: number): void {
    this.bookNavigationService.updateCurrentBook(bookId);

    if (this.metadataCenterViewMode === 'route') {
      this.router.navigate(['/book', bookId], {
        queryParams: {tab: 'match'},
        queryParamsHandling: 'merge'
      });
      return;
    }

    this.metadataHostService.switchBook(bookId);
  }

  onSubmit(): void {
    this.searchTriggered = true;
    if (this.form.valid) {
      const providerKeys = this.getSelectedProviders();
      if (providerKeys.length === 0) return;

      const fetchRequest: FetchMetadataRequest = {
        bookId: this.bookId,
        providers: providerKeys,
        title: this.form.get('title')?.value,
        author: this.form.get('author')?.value,
        isbn: this.form.get('isbn')?.value,
        sourceUrl: this.form.get('sourceUrl')?.value?.trim?.() || undefined
      };

      this.loading = true;
      this.allFetchedMetadata = [];
      this.filteredMetadata = [];
      this.providerCounts.clear();
      this.providerLoading.clear();
      this.providerCompletionStatus.clear();
      this.metadataByProvider.clear();
      this.selectedProviderFilters = new Set(['all']);
      this.cancelRequest$.next();

      providerKeys.forEach((provider: string) => {
        const providerLower = provider.toLowerCase();
        this.providerCounts.set(providerLower, 0);
        this.providerLoading.set(providerLower, true);
        this.providerCompletionStatus.set(providerLower, false);
        this.metadataByProvider.set(providerLower, []);
      });

      this.updateProviderFilterOptions();

      const activeProviders = new Set<string>(providerKeys.map((p: string) => p.toLowerCase()));

      this.bookMetadataService.fetchBookMetadata(fetchRequest.bookId, fetchRequest)
        .pipe(takeUntil(this.cancelRequest$))
        .subscribe({
          next: (metadata) => {
            const metadataWithThumbnail = {
              ...metadata,
              thumbnailUrl: metadata.thumbnailUrl
            };

            const provider = this.getProviderFromMetadata(metadata);
            if (provider) {
              const providerList = this.metadataByProvider.get(provider) || [];
              providerList.push(metadataWithThumbnail);
              this.metadataByProvider.set(provider, providerList);

              this.providerCounts.set(provider, providerList.length);

              if (!this.providerCompletionStatus.get(provider)) {
                this.providerLoading.set(provider, false);
                this.providerCompletionStatus.set(provider, true);
              }
            }

            this.allFetchedMetadata = this.interleaveResults();

            this.applyFilter();
            this.updateProviderFilterOptions();
          },
          error: (error) => {
            console.error('Error fetching metadata:', error);
            this.loading = false;
            this.providerLoading.clear();
          },
          complete: () => {
            this.loading = false;
            activeProviders.forEach((provider: string) => {
              if (!this.providerCompletionStatus.get(provider)) {
                this.providerLoading.set(provider, false);
                this.providerCompletionStatus.set(provider, true);
              }
            });
          }
        });
    } else {
      console.warn('Form is invalid. Please fill in all required fields.');
    }
  }

  private interleaveResults(): BookMetadata[] {
    const interleaved: BookMetadata[] = [];
    const providers = Array.from(this.metadataByProvider.keys());

    if (providers.length === 0) return [];

    const maxLength = Math.max(
      ...Array.from(this.metadataByProvider.values()).map(list => list.length)
    );

    for (let i = 0; i < maxLength; i++) {
      for (const provider of providers) {
        const providerList = this.metadataByProvider.get(provider);
        if (providerList && i < providerList.length) {
          interleaved.push(providerList[i]);
        }
      }
    }

    return interleaved;
  }

  private getProviderFromMetadata(metadata: BookMetadata): string | null {
    if (metadata.asin) return 'amazon';
    if (metadata.goodreadsId) return 'goodreads';
    if (metadata.googleId) return 'google';
    if (metadata.hardcoverId) return 'hardcover';
    if (metadata['doubanId']) return 'douban';
    if (metadata['lubimyczytacId']) return 'lubimyczytac';
    if (metadata.comicvineId) return 'comicvine';
    if (metadata.ranobedbId) return 'ranobedb';
    if (metadata.audibleId) return 'audible';
    return metadata.provider?.toLowerCase() || null;
  }

  getProviderClass(metadata: BookMetadata): string {
    return this.getProviderFromMetadata(metadata) || 'unknown';
  }

  private updateProviderFilterOptions(): void {
    this.providerFilterOptions = [
      {label: `All (${this.allFetchedMetadata.length})`, value: 'all'},
      ...Array.from(this.providerCounts.entries())
        .filter(([_, count]) => count > 0)
        .map(([provider, count]) => ({
          label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (${count})`,
          value: provider
        }))
    ];
  }

  private getSelectedProviders(): string[] {
    const providers = this.form.get('provider')?.value;
    return Array.isArray(providers) ? providers : [];
  }

  private tryAutoFillFromSourceUrl(rawSourceUrl: string): void {
    const sourceUrl = rawSourceUrl.trim();
    if (!sourceUrl) {
      return;
    }

    const inferredTitle = this.extractTitleFromComicvineUrl(sourceUrl);
    if (!inferredTitle) {
      return;
    }

    const currentTitle = this.form.get('title')?.value?.trim?.();
    if (!currentTitle) {
      this.form.patchValue({title: inferredTitle}, {emitEvent: false});
    }

    this.ensureComicvineProviderSelected();
  }

  private ensureComicvineProviderSelected(): void {
    if (!this.providers.includes('Comicvine')) {
      return;
    }

    const selectedProviders = this.getSelectedProviders();
    if (selectedProviders.includes('Comicvine')) {
      return;
    }

    this.form.patchValue({provider: [...selectedProviders, 'Comicvine']});
  }

  private extractTitleFromComicvineUrl(sourceUrl: string): string | null {
    const match = sourceUrl.match(MetadataSearcherComponent.COMICVINE_URL_SLUG_PATTERN);
    if (!match?.[1]) {
      return null;
    }

    try {
      const decodedSlug = decodeURIComponent(match[1]);
      const normalizedTitle = decodedSlug
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!normalizedTitle) {
        return null;
      }

      return normalizedTitle
        .split(' ')
        .map((word: string) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word)
        .join(' ');
    } catch {
      return null;
    }
  }

  private getStoredProviders(): string[] | null {
    const saved = localStorage.getItem(this.providerStorageKey);
    if (saved === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((provider): provider is string => typeof provider === 'string') : [];
    } catch {
      return null;
    }
  }

  private saveProviderSelection(providers: string[]): void {
    localStorage.setItem(this.providerStorageKey, JSON.stringify(providers));
  }

  private areProviderSelectionsEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((provider, index) => provider === right[index]);
  }

  onProviderPillClick(provider: string, event: MouseEvent): void {
    const providerLower = provider.toLowerCase();

    if (event.ctrlKey || event.metaKey) {
      if (this.selectedProviderFilters.has(providerLower)) {
        this.selectedProviderFilters.delete(providerLower);
      } else {
        this.selectedProviderFilters.add(providerLower);
        this.selectedProviderFilters.delete('all');
      }

      if (this.selectedProviderFilters.size === 0) {
        this.selectedProviderFilters.add('all');
      }
    } else {
      if (this.selectedProviderFilters.has(providerLower) && this.selectedProviderFilters.size === 1) {
        this.selectedProviderFilters.clear();
        this.selectedProviderFilters.add('all');
      } else {
        this.selectedProviderFilters.clear();
        this.selectedProviderFilters.add(providerLower);
      }
    }

    this.applyFilter();
  }

  isProviderPillActive(provider: string): boolean {
    return this.selectedProviderFilters.has(provider.toLowerCase());
  }

  isProviderLoading(provider: string): boolean {
    return this.providerLoading.get(provider.toLowerCase()) ?? false;
  }

  private applyFilter(): void {
    if (this.selectedProviderFilters.has('all')) {
      this.filteredMetadata = [...this.allFetchedMetadata];
    } else {
      this.filteredMetadata = this.allFetchedMetadata.filter(metadata => {
        const provider = this.getProviderFromMetadata(metadata);
        return provider && this.selectedProviderFilters.has(provider);
      });
    }
  }

  getProviderTabs(): { provider: string; count: number }[] {
    return Array.from(this.providerCounts.entries()).map(([provider, count]) => ({
      provider: provider.charAt(0).toUpperCase() + provider.slice(1),
      count
    }));
  }

  onBookClick(fetchedMetadata: BookMetadata) {
    this.selectedFetchedMetadata$.next(fetchedMetadata);

    const enrichment = this.getDetailEnrichmentInfo(fetchedMetadata);

    if (enrichment) {
      this.detailLoading = true;
      this.bookMetadataService.fetchMetadataDetail(enrichment.provider, enrichment.id)
        .pipe(takeUntil(this.cancelRequest$))
        .subscribe({
          next: (enriched) => {
            const current = this.selectedFetchedMetadata$.value;
            const currentId = current && this.getProviderItemId(current, enrichment.provider);
            if (currentId === enrichment.id) {
              this.selectedFetchedMetadata$.next(enriched);
            }
            this.detailLoading = false;
          },
          error: (err) => {
            console.error('Error fetching detailed metadata:', err);
            this.detailLoading = false;
          }
        });
    }
  }

  private getDetailEnrichmentInfo(metadata: BookMetadata): { provider: string; id: string } | null {
    if (metadata.comicvineId && (!metadata.comicMetadata
      || (!metadata.comicMetadata.pencillers?.length
        && !metadata.comicMetadata.inkers?.length
        && !metadata.comicMetadata.colorists?.length
        && !metadata.comicMetadata.letterers?.length
        && !metadata.comicMetadata.editors?.length
        && !metadata.comicMetadata.characters?.length))) {
      return {provider: 'Comicvine', id: metadata.comicvineId};
    }
    if (metadata.goodreadsId && !metadata.description) {
      return {provider: 'GoodReads', id: metadata.goodreadsId};
    }
    if (metadata.asin && !metadata.description) {
      return {provider: 'Amazon', id: metadata.asin};
    }
    if (metadata.audibleId && !metadata.description) {
      return {provider: 'Audible', id: metadata.audibleId};
    }
    return null;
  }

  private getProviderItemId(metadata: BookMetadata, provider: string): string | undefined {
    switch (provider) {
      case 'Comicvine': return metadata.comicvineId;
      case 'GoodReads': return metadata.goodreadsId;
      case 'Amazon': return metadata.asin;
      case 'Audible': return metadata.audibleId;
      default: return undefined;
    }
  }

  onGoBack() {
    this.detailLoading = false;
    this.selectedFetchedMetadata$.next(null);
  }

  sanitizeHtml(htmlString: string | null | undefined): string {
    if (!htmlString) return '';
    return htmlString.replace(/<\/?[^>]+(>|$)/g, '').trim();
  }

  truncateText(text: string | null, length: number): string {
    const safeText = text ?? '';
    return safeText.length > length ? safeText.substring(0, length) + '...' : safeText;
  }

  buildProviderLink(metadata: BookMetadata): string {
    if (metadata.asin) {
      return `<a href="https://www.amazon.com/dp/${metadata.asin}" target="_blank">Amazon</a>`;
    } else if (metadata.goodreadsId) {
      return `<a href="https://www.goodreads.com/book/show/${metadata.goodreadsId}" target="_blank">Goodreads</a>`;
    } else if (metadata.googleId) {
      return `<a href="https://books.google.com/books?id=${metadata.googleId}" target="_blank">Google</a>`;
    } else if (metadata.hardcoverId) {
      return `<a href="https://hardcover.app/books/${metadata.hardcoverId}" target="_blank">Hardcover</a>`;
    } else if (metadata['doubanId']) {
      return `<a href="https://book.douban.com/subject/${metadata['doubanId']}" target="_blank">Douban</a>`;
    } else if (metadata['lubimyczytacId']) {
      return `<a href="https://lubimyczytac.pl/ksiazka/${metadata['lubimyczytacId']}/ksiazka" target="_blank">Lubimyczytac</a>`;
    } else if (metadata.comicvineId) {
      if (metadata.externalUrl) {
        return `<a href="${metadata.externalUrl}" target="_blank">Comicvine</a>`;
      }
      return `<a href="https://comicvine.gamespot.com/4050-${metadata.comicvineId}/" target="_blank">Comicvine</a>`;
    } else if (metadata.ranobedbId) {
      return `<a href="https://ranobedb.org/book/${metadata.ranobedbId}" target="_blank">RanobeDB</a>`;
    } else if (metadata.audibleId) {
      return `<a href="https://www.audible.com/pd/${metadata.audibleId}" target="_blank">Audible</a>`;
    } else if (metadata.externalUrl) {
      const providerName = metadata.provider || 'Link';
      return `<a href="${metadata.externalUrl}" target="_blank">${providerName}</a>`;
    }
    throw new Error("No provider ID found in metadata.");
  }

  trackByMetadata(index: number, metadata: BookMetadata): string {
    return metadata.googleId || metadata.goodreadsId || metadata.asin ||
      metadata.hardcoverId || metadata.comicvineId || metadata.audibleId || index.toString();
  }

  onProviderClick(event: Event) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' || target.closest('a')) {
      event.stopPropagation();
    }
  }
}
