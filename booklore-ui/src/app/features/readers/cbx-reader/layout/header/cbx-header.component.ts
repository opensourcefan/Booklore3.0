import {Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {TranslocoPipe} from '@jsverse/transloco';
import {CbxHeaderService, CbxHeaderState} from './cbx-header.service';
import {ReaderIconComponent} from '../../../ebook-reader';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-cbx-header',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReaderIconComponent],
  templateUrl: './cbx-header.component.html',
  styleUrls: ['./cbx-header.component.scss']
})
export class CbxHeaderComponent implements OnInit, OnDestroy {
  private headerService = inject(CbxHeaderService);
  private destroy$ = new Subject<void>();

  @Input() isCurrentPageBookmarked = false;
  @Input() currentPageHasNotes = false;
  @Input() aiEnabled = false;
  @Input() aiWorking = false;
  @Input() aiReady = false;
  @Input() aiScanned = false;
  @Input() aiPanelCount = 0;
  @Input() aiPageCount = 0;
  @Input() isPinned = false;
  @Input() panelTravelFactor = 1;
  @Input() panelTravelControlsVisible = false;
  @Input() panelZoomControlsVisible = false;

  @Output() aiPanelDetection = new EventEmitter<void>();
  @Output() aiRescan = new EventEmitter<void>();
  @Output() aiDeleteScan = new EventEmitter<void>();
  @Output() aiOpenSettings = new EventEmitter<void>();
  @Output() togglePin = new EventEmitter<void>();
  @Output() panelTravelFactorChange = new EventEmitter<number>();
  @Output() panelZoomOut = new EventEmitter<void>();
  @Output() panelZoomIn = new EventEmitter<void>();

  isVisible = true;
  overflowOpen = false;
  aiMenuOpen = false;
  panelAdjustOpen = false;
  state: CbxHeaderState = {
    isFullscreen: false,
    isSlideshowActive: false,
    isMagnifierActive: false,
    isPanelModeEnabled: false
  };

  get bookTitle(): string {
    return this.headerService.title;
  }

  ngOnInit(): void {
    this.headerService.forceVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => this.isVisible = visible);

    this.headerService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.state = state);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onOpenSidebar(): void {
    this.headerService.openSidebar();
  }

  onOpenSettings(): void {
    this.headerService.openQuickSettings();
  }

  onToggleBookmark(): void {
    this.headerService.toggleBookmark();
  }

  onOpenNoteDialog(): void {
    this.headerService.openNoteDialog();
  }

  onToggleFullscreen(): void {
    this.headerService.toggleFullscreen();
  }

  onToggleSlideshow(): void {
    this.headerService.toggleSlideshow();
  }

  onToggleMagnifier(): void {
    this.headerService.toggleMagnifier();
  }

  onShowShortcutsHelp(): void {
    this.headerService.showShortcutsHelp();
  }

  onTogglePanelMode(): void {
    this.headerService.togglePanelMode();
  }

  onAiPanelDetection(): void {
    this.aiPanelDetection.emit();
  }

  onAiRescan(): void {
    this.aiRescan.emit();
  }

  onAiDeleteScan(): void {
    this.aiDeleteScan.emit();
  }

  onAiOpenSettings(): void {
    this.aiOpenSettings.emit();
  }

  onToggleAiMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.aiMenuOpen = !this.aiMenuOpen;
    if (this.aiMenuOpen) {
      this.overflowOpen = false;
    }
  }

  closeMenus(): void {
    this.aiMenuOpen = false;
    this.overflowOpen = false;
    this.panelAdjustOpen = false;
  }

  onTogglePanelAdjust(event: MouseEvent): void {
    event.stopPropagation();
    this.panelAdjustOpen = !this.panelAdjustOpen;
  }

  onPanelTravelDelta(delta: number): void {
    const next = Math.min(2.5, Math.max(0.4, this.panelTravelFactor + delta));
    this.panelTravelFactorChange.emit(Number(next.toFixed(2)));
  }

  onPanelTravelInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = Number(target.value);
    if (Number.isFinite(value)) {
      this.panelTravelFactorChange.emit(Math.min(2.5, Math.max(0.4, value)));
    }
  }

  onTogglePin(): void {
    this.togglePin.emit();
  }

  onPanelZoomOut(): void {
    this.panelZoomOut.emit();
  }

  onPanelZoomIn(): void {
    this.panelZoomIn.emit();
  }

  onClose(): void {
    this.headerService.close();
  }
}
