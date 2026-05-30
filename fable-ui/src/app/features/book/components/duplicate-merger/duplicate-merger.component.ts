import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {environment} from '../../../../../environments/environment';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {Tag} from 'primeng/tag';
import {Paginator} from 'primeng/paginator';
import {Subject, takeUntil} from 'rxjs';
import {BookFileService} from '../../service/book-file.service';
import {Book, DuplicateDetectionRequest, DuplicateGroup, DuplicateScanScope} from '../../model/book.model';
import {MessageService} from 'primeng/api';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {BookStateService} from '../../service/book-state.service';
import {BookDialogHelperService} from '../book-browser/book-dialog-helper.service';
import {BookService} from '../../service/book.service';
import {
  DuplicateResolutionMatchingConfig,
  DuplicateResolutionPlan,
  DuplicateResolutionPlanEntry,
  UserService,
} from '../../../settings/user-management/user.service';
import {naturalCompareStrings} from '../../../../shared/util/natural-sort.util';

type PresetMode = 'strict' | 'balanced' | 'aggressive' | 'custom';

interface ScanScopeCard {
  value: DuplicateScanScope;
  label: string;
  description: string;
  countLabel: string;
  disabled?: boolean;
}

interface DisplayGroup extends DuplicateGroup {
  dismissed: boolean;
  inspectedBookId: number;
  preferredTargetBookId: number;
  queuedForPlan: boolean;
}

@Component({
  selector: 'app-duplicate-merger',
  standalone: true,
  imports: [
    FormsModule,
    Button,
    Checkbox,
    Tag,
    Paginator,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './duplicate-merger.component.html',
  styleUrls: ['./duplicate-merger.component.scss']
})
export class DuplicateMergerComponent implements OnInit, OnDestroy {
  libraryId?: number;
  libraryName?: string;
  presetMode: PresetMode = 'balanced';
  selectedScope: DuplicateScanScope = 'ALL_LIBRARIES';
  showAdvanced = false;

  matchByIsbn = true;
  matchByExternalId = true;
  matchByTitleAuthor = true;
  matchByDirectory = false;
  matchByFilename = false;

  isScanning = false;
  hasScanned = false;

  groups: DisplayGroup[] = [];
  currentViewBookIds: number[] = [];
  savedPlan: DuplicateResolutionPlan | null = null;

  pageFirst = 0;
  pageSize = 20;

  private destroy$ = new Subject<void>();
  private readonly bookFileService = inject(BookFileService);
  private readonly bookStateService = inject(BookStateService);
  private readonly bookDialogHelperService = inject(BookDialogHelperService);
  private readonly bookService = inject(BookService);
  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);
  private readonly t = inject(TranslocoService);
  readonly urlHelper = inject(UrlHelperService);

  ngOnInit(): void {
    this.libraryId = this.config.data.libraryId;
    this.libraryName = this.config.data.libraryName;
    this.currentViewBookIds = Array.from(new Set((this.bookStateService.getCurrentBookState().books ?? []).map(book => book.id)));
    this.selectedScope = this.getDefaultScope();
    this.applyPreset('balanced');

    this.userService.userState$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.savedPlan = state.user?.userSettings?.duplicateResolutionPlan ?? null;

      if (this.savedPlan && !this.hasScanned && !this.isScanning) {
        this.applySavedWorkflow(this.savedPlan);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPresetChange(): void {
    if (this.presetMode !== 'custom') {
      this.applyPreset(this.presetMode);
    }
  }

  onSignalToggle(): void {
    this.presetMode = 'custom';
  }

  selectScope(scope: DuplicateScanScope): void {
    if (this.isScanning || !this.isScopeAvailable(scope)) {
      return;
    }

    this.selectedScope = scope;
  }

  selectPreset(mode: PresetMode): void {
    if (this.isScanning) {
      return;
    }

    this.presetMode = mode;
    if (mode === 'custom') {
      this.resetSignals();
      this.showAdvanced = true;
      return;
    }

    this.onPresetChange();
  }

  applyPreset(mode: PresetMode): void {
    switch (mode) {
      case 'strict':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = false;
        this.matchByDirectory = false;
        this.matchByFilename = false;
        break;
      case 'balanced':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = true;
        this.matchByDirectory = false;
        this.matchByFilename = false;
        break;
      case 'aggressive':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = true;
        this.matchByDirectory = true;
        this.matchByFilename = true;
        break;
      case 'custom':
        this.resetSignals();
        break;
    }
  }

  get scopeCards(): ScanScopeCard[] {
    return [
      {
        value: 'BOOK_IDS',
        label: this.t.translate('book.duplicateMerger.scope.currentViewTitle'),
        description: this.t.translate('book.duplicateMerger.scope.currentViewDescription'),
        countLabel: this.t.translate('book.duplicateMerger.scope.countLabel', {count: this.currentViewBookIds.length}),
        disabled: this.currentViewBookIds.length < 2,
      },
      {
        value: 'CURRENT_LIBRARY',
        label: this.t.translate('book.duplicateMerger.scope.currentLibraryTitle'),
        description: this.libraryName
          ? this.t.translate('book.duplicateMerger.scope.currentLibraryDescriptionNamed', {name: this.libraryName})
          : this.t.translate('book.duplicateMerger.scope.currentLibraryDescription'),
        countLabel: this.libraryName ?? this.t.translate('book.duplicateMerger.scope.currentLibraryBadge'),
        disabled: !this.libraryId,
      },
      {
        value: 'ALL_LIBRARIES',
        label: this.t.translate('book.duplicateMerger.scope.allLibrariesTitle'),
        description: this.t.translate('book.duplicateMerger.scope.allLibrariesDescription'),
        countLabel: this.t.translate('book.duplicateMerger.scope.allLibrariesBadge'),
      },
    ];
  }

  get presetCards(): { value: PresetMode; label: string; description: string }[] {
    return [
      {
        value: 'strict',
        label: this.t.translate('book.duplicateMerger.presetStrict'),
        description: this.t.translate('book.duplicateMerger.presetStrictDescription'),
      },
      {
        value: 'balanced',
        label: this.t.translate('book.duplicateMerger.presetBalanced'),
        description: this.t.translate('book.duplicateMerger.presetBalancedDescription'),
      },
      {
        value: 'aggressive',
        label: this.t.translate('book.duplicateMerger.presetAggressive'),
        description: this.t.translate('book.duplicateMerger.presetAggressiveDescription'),
      },
      {
        value: 'custom',
        label: this.t.translate('book.duplicateMerger.presetCustom'),
        description: this.t.translate('book.duplicateMerger.presetCustomDescription'),
      },
    ];
  }

  scan(): void {
    this.isScanning = true;
    this.hasScanned = false;
    this.groups = [];
    this.pageFirst = 0;

    const request: DuplicateDetectionRequest = {
      scope: this.selectedScope,
      libraryId: this.selectedScope === 'CURRENT_LIBRARY' ? this.libraryId : undefined,
      bookIds: this.selectedScope === 'BOOK_IDS' ? this.currentViewBookIds : undefined,
      matchByIsbn: this.matchByIsbn,
      matchByExternalId: this.matchByExternalId,
      matchByTitleAuthor: this.matchByTitleAuthor,
      matchByDirectory: this.matchByDirectory,
      matchByFilename: this.matchByFilename,
    };

    this.bookFileService.findDuplicates(request).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (groups) => {
        this.groups = groups.map(g => ({
          ...g,
          dismissed: false,
          inspectedBookId: g.suggestedTargetBookId,
          preferredTargetBookId: g.suggestedTargetBookId,
          queuedForPlan: false,
        }));
        this.rehydrateSavedPlanSelections();
        this.isScanning = false;
        this.hasScanned = true;
      },
      error: (err) => {
        this.isScanning = false;
        this.hasScanned = true;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.duplicateMerger.toast.scanFailedSummary'),
          detail: err?.error?.message || this.t.translate('book.duplicateMerger.toast.scanFailedDetail'),
        });
      }
    });
  }

  get activeGroups(): DisplayGroup[] {
    return this.groups.filter(g => !g.dismissed);
  }

  get plannedGroups(): DisplayGroup[] {
    return this.activeGroups.filter(group => group.queuedForPlan);
  }

  get pagedGroups(): DisplayGroup[] {
    return this.activeGroups.slice(this.pageFirst, this.pageFirst + this.pageSize);
  }

  get hasSavedPlan(): boolean {
    return !!this.savedPlan && this.getSavedPlanQueuedCount() > 0;
  }

  get savedPlanEntries(): DuplicateResolutionPlanEntry[] {
    return this.savedPlan?.entries ?? [];
  }

  get canScan(): boolean {
    return !this.isScanning && this.isScopeAvailable(this.selectedScope) &&
      (this.matchByIsbn || this.matchByExternalId || this.matchByTitleAuthor ||
        this.matchByDirectory || this.matchByFilename);
  }

  onPageChange(event: { first?: number; rows?: number }): void {
    this.pageFirst = event.first ?? 0;
    this.pageSize = event.rows ?? this.pageSize;
  }

  getBookFormats(book: Book): string[] {
    const formats: string[] = [];
    if (book.primaryFile?.bookType) {
      formats.push(book.primaryFile.bookType);
    }
    if (book.alternativeFormats) {
      for (const alt of book.alternativeFormats) {
        if (alt.bookType) {
          formats.push(alt.bookType);
        }
      }
    }
    return formats;
  }

  getFileCount(book: Book): number {
    let count = book.primaryFile ? 1 : 0;
    count += book.alternativeFormats?.length ?? 0;
    return count;
  }

  getMatchReasonLabel(reason: string): string {
    return this.t.translate(`book.duplicateMerger.reason.${reason}`);
  }

  hasSameFormatConflict(group: DisplayGroup): boolean {
    const formats = new Set<string>();
    for (const book of group.books) {
      if (book.primaryFile?.bookType) {
        if (formats.has(book.primaryFile.bookType)) return true;
        formats.add(book.primaryFile.bookType);
      }
    }
    return false;
  }

  getBookFilePath(book: Book): string {
    const subPath = book.primaryFile?.fileSubPath;
    const fileName = book.primaryFile?.fileName || '';
    if (subPath) return `${subPath}/${fileName}`;
    return fileName;
  }

  formatFileSize(sizeKb?: number): string {
    if (!sizeKb) return '';
    if (sizeKb < 1024) return `${sizeKb} KB`;
    const sizeMb = sizeKb / 1024;
    if (sizeMb < 1024) return `${sizeMb.toFixed(1)} MB`;
    return `${(sizeMb / 1024).toFixed(2)} GB`;
  }

  getMatchReasonSeverity(reason: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
    switch (reason) {
      case 'ISBN':
      case 'EXTERNAL_ID':
        return 'success';
      case 'TITLE_AUTHOR':
        return 'info';
      case 'DIRECTORY':
        return 'warn';
      case 'FILENAME':
        return 'secondary';
      default:
        return 'info';
    }
  }

  dismissGroup(group: DisplayGroup): void {
    group.queuedForPlan = false;
    group.dismissed = true;
    this.persistResolutionPlan();
    if (this.pagedGroups.length === 0 && this.pageFirst > 0) {
      this.pageFirst = Math.max(0, this.pageFirst - this.pageSize);
    }
  }

  getSuggestedTarget(group: DisplayGroup): Book | undefined {
    return group.books.find(book => book.id === group.suggestedTargetBookId);
  }

  getPreferredTarget(group: DisplayGroup): Book | undefined {
    return group.books.find(book => book.id === group.preferredTargetBookId) ?? this.getSuggestedTarget(group);
  }

  getInspectedBook(group: DisplayGroup): Book | undefined {
    return group.books.find(book => book.id === group.inspectedBookId) ?? this.getSuggestedTarget(group);
  }

  getSortedBooks(group: DisplayGroup): Book[] {
    return [...group.books].sort((left, right) => {
      if (left.id === group.suggestedTargetBookId) {
        return -1;
      }
      if (right.id === group.suggestedTargetBookId) {
        return 1;
      }
      return naturalCompareStrings(left.metadata?.title ?? '', right.metadata?.title ?? '');
    });
  }

  setInspectedBook(group: DisplayGroup, bookId: number): void {
    group.inspectedBookId = bookId;
  }

  setPreferredTarget(group: DisplayGroup, bookId: number): void {
    group.preferredTargetBookId = bookId;
    group.inspectedBookId = bookId;

    if (group.queuedForPlan) {
      this.persistResolutionPlan();
    }
  }

  toggleGroupPlan(group: DisplayGroup): void {
    group.queuedForPlan = !group.queuedForPlan;
    this.persistResolutionPlan();
  }

  clearResolutionPlan(): void {
    for (const group of this.groups) {
      group.queuedForPlan = false;
    }

    this.persistResolutionPlan();
  }

  clearSavedPlan(): void {
    this.clearResolutionPlan();
  }

  canOpenBook(book: Book): boolean {
    return !!book.primaryFile?.bookType;
  }

  openBookDetails(bookId: number): void {
    this.bookDialogHelperService.openBookDetailsDialog(bookId);
  }

  openBook(book: Book): void {
    if (!this.canOpenBook(book)) {
      return;
    }

    this.bookService.readBook(book.id);
  }

  getAuthorLabel(book: Book): string {
    return book.metadata?.authors?.join(', ') || this.t.translate('book.duplicateMerger.unknownValue');
  }

  getSeriesLabel(book: Book): string {
    const seriesName = book.metadata?.seriesName;
    if (!seriesName) {
      return this.t.translate('book.duplicateMerger.unknownValue');
    }

    const seriesNumber = book.metadata?.seriesNumber;
    return seriesNumber !== null && seriesNumber !== undefined
      ? this.t.translate('book.duplicateMerger.seriesLabel', {name: seriesName, number: seriesNumber})
      : seriesName;
  }

  getIdentifierSummary(book: Book): string {
    const values = [
      book.metadata?.isbn13,
      book.metadata?.isbn10,
      book.metadata?.goodreadsId,
      book.metadata?.hardcoverId,
      book.metadata?.googleId,
      book.metadata?.asin,
      book.metadata?.comicvineId,
      book.metadata?.audibleId,
    ].filter((value): value is string => !!value && value.trim().length > 0);

    return values.length > 0 ? values.join(' • ') : this.t.translate('book.duplicateMerger.unknownValue');
  }

  getFormatSummary(book: Book): string {
    const formats = this.getBookFormats(book);
    return formats.length > 0 ? formats.join(', ') : this.t.translate('book.duplicateMerger.unknownValue');
  }

  getComparisonFields(book: Book): { label: string; value: string }[] {
    return [
      {label: this.t.translate('book.duplicateMerger.compare.author'), value: this.getAuthorLabel(book)},
      {label: this.t.translate('book.duplicateMerger.compare.library'), value: book.libraryName || this.t.translate('book.duplicateMerger.unknownValue')},
      {label: this.t.translate('book.duplicateMerger.compare.series'), value: this.getSeriesLabel(book)},
      {label: this.t.translate('book.duplicateMerger.compare.formats'), value: this.getFormatSummary(book)},
      {label: this.t.translate('book.duplicateMerger.compare.path'), value: this.getBookFilePath(book) || this.t.translate('book.duplicateMerger.unknownValue')},
      {label: this.t.translate('book.duplicateMerger.compare.identifiers'), value: this.getIdentifierSummary(book)},
    ];
  }

  getResolutionSummary(): string {
    return this.t.translate('book.duplicateMerger.planSummary', {
      queued: this.plannedGroups.length,
      total: this.activeGroups.length,
    });
  }

  getSavedPlanSummary(): string {
    if (!this.savedPlan) {
      return '';
    }

    return this.t.translate('book.duplicateMerger.savedPlanSummary', {
      count: this.getSavedPlanQueuedCount(),
      savedAt: this.formatSavedTimestamp(this.savedPlan.savedAt),
    });
  }

  getSavedPlanSignalSummary(): string {
    if (!this.savedPlan?.matchingSignals?.length) {
      return this.t.translate('book.duplicateMerger.unknownValue');
    }

    return this.savedPlan.matchingSignals.join(', ');
  }

  getSavedEntryCandidateCount(entry: DuplicateResolutionPlanEntry): number {
    return entry.candidateBookIds?.length ?? Math.max(0, this.getSavedEntryBookIds(entry).length - 1);
  }

  getSavedEntryBookTitles(entry: DuplicateResolutionPlanEntry): string {
    const titles = entry.books?.map(book => book.title).filter(title => !!title?.trim()) ?? [];
    return titles.length > 0 ? titles.join(' • ') : this.t.translate('book.duplicateMerger.unknownValue');
  }

  buildResolutionPlanPayload(savedAt = new Date().toISOString()): DuplicateResolutionPlan {
    return {
      savedAt,
      scope: this.selectedScope,
      scopeLabel: this.getSelectedScopeLabel(),
      scopeDescription: this.getSelectedScopeDescription(),
      matchingSignals: this.getActiveSignalLabels(),
      matchingConfig: this.getCurrentMatchingConfig(),
      queuedGroupCount: this.plannedGroups.length,
      entries: this.plannedGroups.map((group, index) => this.toResolutionPlanEntry(group, index)),
    };
  }

  buildResolutionPlanMarkdown(): string {
    const payload = this.buildResolutionPlanPayload();
    const appName = environment.appName || 'Fable';
    const lines: string[] = [
      `# ${appName} Duplicate Resolution Plan`,
      '',
      `Generated: ${payload.savedAt}`,
      `Scope: ${payload.scopeLabel}`,
      `Signals: ${payload.matchingSignals.join(', ')}`,
      `Queued groups: ${payload.queuedGroupCount}`,
    ];

    for (const entry of payload.entries) {
      lines.push('', `## Group ${entry.groupIndex}`);
      lines.push(`Reason: ${this.getMatchReasonLabel(entry.matchReason)}`);
      lines.push(`Preferred keep: ${entry.keepTitle} (#${entry.keepBookId})`);
      lines.push(`Other candidates: ${entry.candidateBookIds.length > 0 ? entry.candidateBookIds.join(', ') : 'None'}`);
      lines.push('');

      for (const book of entry.books) {
        const flags = [book.isPreferredKeep ? 'preferred keep' : '', book.isSuggestedKeep ? 'scan suggestion' : '']
          .filter(Boolean)
          .join(', ');
        lines.push(`- #${book.id} ${book.title}${flags ? ` [${flags}]` : ''}`);
        lines.push(`  Library: ${book.library}`);
        lines.push(`  Authors: ${book.authors}`);
        lines.push(`  Formats: ${book.formats}`);
        lines.push(`  Path: ${book.path}`);
      }
    }

    return lines.join('\n');
  }

  async copyResolutionPlan(): Promise<void> {
    if (this.plannedGroups.length === 0) {
      return;
    }

    const text = this.buildResolutionPlanMarkdown();
    if (!navigator.clipboard?.writeText) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('book.duplicateMerger.toast.copyUnavailableSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.copyUnavailableDetail'),
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.messageService.add({
        severity: 'success',
        summary: this.t.translate('book.duplicateMerger.toast.planCopiedSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.planCopiedDetail', {count: this.plannedGroups.length}),
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('book.duplicateMerger.toast.copyFailedSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.copyFailedDetail'),
      });
    }
  }

  downloadResolutionPlan(): void {
    if (this.plannedGroups.length === 0) {
      return;
    }

    const payload = this.buildResolutionPlanPayload();
    this.downloadTextFile(
      this.buildResolutionFilename('json'),
      JSON.stringify(payload, null, 2),
      'application/json'
    );

    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('book.duplicateMerger.toast.planDownloadedSummary'),
      detail: this.t.translate('book.duplicateMerger.toast.planDownloadedDetail', {count: this.plannedGroups.length}),
    });
  }

  getResultSummary(): string {
    switch (this.selectedScope) {
      case 'BOOK_IDS':
        return this.t.translate('book.duplicateMerger.resultsSummaryCurrentView', {
          groups: this.activeGroups.length,
          books: this.currentViewBookIds.length,
        });
      case 'CURRENT_LIBRARY':
        return this.t.translate('book.duplicateMerger.resultsSummaryCurrentLibrary', {
          groups: this.activeGroups.length,
        });
      case 'ALL_LIBRARIES':
      default:
        return this.t.translate('book.duplicateMerger.resultsSummaryAllLibraries', {
          groups: this.activeGroups.length,
        });
    }
  }

  getSelectedScopeLabel(): string {
    return this.scopeCards.find(card => card.value === this.selectedScope)?.label ?? '';
  }

  getSelectedScopeDescription(): string {
    return this.scopeCards.find(card => card.value === this.selectedScope)?.description ?? '';
  }

  private getActiveSignalLabels(): string[] {
    return [
      this.matchByIsbn ? this.t.translate('book.duplicateMerger.signalIsbn') : null,
      this.matchByExternalId ? this.t.translate('book.duplicateMerger.signalExternalId') : null,
      this.matchByTitleAuthor ? this.t.translate('book.duplicateMerger.signalTitleAuthor') : null,
      this.matchByDirectory ? this.t.translate('book.duplicateMerger.signalDirectory') : null,
      this.matchByFilename ? this.t.translate('book.duplicateMerger.signalFilename') : null,
    ].filter((value): value is string => !!value);
  }

  private getCurrentMatchingConfig(): DuplicateResolutionMatchingConfig {
    return {
      matchByIsbn: this.matchByIsbn,
      matchByExternalId: this.matchByExternalId,
      matchByTitleAuthor: this.matchByTitleAuthor,
      matchByDirectory: this.matchByDirectory,
      matchByFilename: this.matchByFilename,
    };
  }

  private resetSignals(): void {
    this.matchByIsbn = false;
    this.matchByExternalId = false;
    this.matchByTitleAuthor = false;
    this.matchByDirectory = false;
    this.matchByFilename = false;
  }

  private toResolutionPlanEntry(group: DisplayGroup, index: number): DuplicateResolutionPlanEntry {
    const preferredTarget = this.getPreferredTarget(group);
    const keepBookId = preferredTarget?.id ?? group.preferredTargetBookId;

    return {
      groupIndex: this.groups.indexOf(group) + 1 || index + 1,
      matchReason: group.matchReason,
      keepBookId,
      keepTitle: preferredTarget?.metadata?.title || this.t.translate('book.fileAttacher.unknownTitle'),
      candidateBookIds: group.books
        .filter(book => book.id !== keepBookId)
        .map(book => book.id),
      books: this.getSortedBooks(group).map(book => ({
        id: book.id,
        title: book.metadata?.title || this.t.translate('book.fileAttacher.unknownTitle'),
        authors: this.getAuthorLabel(book),
        library: book.libraryName || this.t.translate('book.duplicateMerger.unknownValue'),
        formats: this.getFormatSummary(book),
        path: this.getBookFilePath(book) || this.t.translate('book.duplicateMerger.unknownValue'),
        isPreferredKeep: book.id === keepBookId,
        isSuggestedKeep: book.id === group.suggestedTargetBookId,
      })),
    };
  }

  private persistResolutionPlan(): void {
    const currentUser = this.userService.getCurrentUser();
    if (!currentUser) {
      return;
    }

    const nextPlan = this.plannedGroups.length > 0 ? this.buildResolutionPlanPayload() : null;
    this.userService.updateUserSetting(currentUser.id, 'duplicateResolutionPlan', nextPlan);
  }

  private applySavedWorkflow(plan: DuplicateResolutionPlan): void {
    if (this.isScopeAvailable(plan.scope)) {
      this.selectedScope = plan.scope;
    }

    if (plan.matchingConfig) {
      this.matchByIsbn = plan.matchingConfig.matchByIsbn;
      this.matchByExternalId = plan.matchingConfig.matchByExternalId;
      this.matchByTitleAuthor = plan.matchingConfig.matchByTitleAuthor;
      this.matchByDirectory = plan.matchingConfig.matchByDirectory;
      this.matchByFilename = plan.matchingConfig.matchByFilename;
      this.presetMode = this.detectPresetMode(plan.matchingConfig);
      this.showAdvanced = this.presetMode === 'custom';
    }
  }

  private detectPresetMode(config: DuplicateResolutionMatchingConfig): PresetMode {
    if (config.matchByIsbn && config.matchByExternalId && !config.matchByTitleAuthor && !config.matchByDirectory && !config.matchByFilename) {
      return 'strict';
    }

    if (config.matchByIsbn && config.matchByExternalId && config.matchByTitleAuthor && !config.matchByDirectory && !config.matchByFilename) {
      return 'balanced';
    }

    if (config.matchByIsbn && config.matchByExternalId && config.matchByTitleAuthor && config.matchByDirectory && config.matchByFilename) {
      return 'aggressive';
    }

    return 'custom';
  }

  private rehydrateSavedPlanSelections(): void {
    if (!this.savedPlan?.entries?.length) {
      return;
    }

    for (const group of this.groups) {
      const savedEntry = this.findSavedEntry(group);
      if (!savedEntry) {
        continue;
      }

      if (group.books.some(book => book.id === savedEntry.keepBookId)) {
        group.preferredTargetBookId = savedEntry.keepBookId;
        group.inspectedBookId = savedEntry.keepBookId;
      }
      group.queuedForPlan = true;
    }
  }

  private findSavedEntry(group: DisplayGroup): DuplicateResolutionPlanEntry | undefined {
    const groupBookIds = [...group.books.map(book => book.id)].sort((left, right) => left - right);

    return this.savedPlan?.entries.find(entry => {
      const entryBookIds = this.getSavedEntryBookIds(entry).sort((left, right) => left - right);
      return entryBookIds.length === groupBookIds.length && entryBookIds.every((bookId, index) => bookId === groupBookIds[index]);
    });
  }

  private getSavedEntryBookIds(entry: DuplicateResolutionPlanEntry): number[] {
    if (entry.books?.length) {
      return entry.books.map(book => book.id);
    }

    return [entry.keepBookId, ...(entry.candidateBookIds ?? [])];
  }

  private getSavedPlanQueuedCount(): number {
    if (!this.savedPlan) {
      return 0;
    }

    return this.savedPlan.queuedGroupCount ?? this.savedPlan.entries?.length ?? 0;
  }

  private formatSavedTimestamp(savedAt?: string): string {
    if (!savedAt) {
      return this.t.translate('book.duplicateMerger.unknownValue');
    }

    const parsed = new Date(savedAt);
    if (Number.isNaN(parsed.getTime())) {
      return savedAt;
    }

    return parsed.toLocaleString();
  }

  private downloadTextFile(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private buildResolutionFilename(extension: string): string {
    const safeTime = new Date().toISOString().replace(/[:.]/g, '-');
    const appName = environment.appName || 'Fable';
    return `${appName.toLowerCase()}-duplicate-plan-${safeTime}.${extension}`;
  }

  private getDefaultScope(): DuplicateScanScope {
    if (this.libraryId) {
      return 'CURRENT_LIBRARY';
    }

    if (this.currentViewBookIds.length >= 2) {
      return 'BOOK_IDS';
    }

    return 'ALL_LIBRARIES';
  }

  private isScopeAvailable(scope: DuplicateScanScope): boolean {
    switch (scope) {
      case 'CURRENT_LIBRARY':
        return !!this.libraryId;
      case 'BOOK_IDS':
        return this.currentViewBookIds.length >= 2;
      case 'ALL_LIBRARIES':
        return true;
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}
