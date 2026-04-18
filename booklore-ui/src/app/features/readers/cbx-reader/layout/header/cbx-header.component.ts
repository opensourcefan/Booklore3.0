import {Component, DoCheck, EventEmitter, inject, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {TranslocoPipe} from '@jsverse/transloco';
import {CbxHeaderService, CbxHeaderState} from './cbx-header.service';
import {ReaderIconComponent} from '../../../ebook-reader';
import {CommonModule} from '@angular/common';
import {MobileBackHandle, MobileBackNavigationService} from '../../../../../shared/service/mobile-back-navigation.service';

type CbxHeaderMobileSurface = 'overflow' | 'aiMenu' | 'panelAdjust';

@Component({
  selector: 'app-cbx-header',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReaderIconComponent],
  templateUrl: './cbx-header.component.html',
  styleUrls: ['./cbx-header.component.scss']
})
export class CbxHeaderComponent implements OnInit, OnDestroy, DoCheck {
  private headerService = inject(CbxHeaderService);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private destroy$ = new Subject<void>();
  private mobileBackHandles: Partial<Record<CbxHeaderMobileSurface, MobileBackHandle>> = {};

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
    this.releaseAllMobileBackRegistrations(false);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngDoCheck(): void {
    this.syncMobileBackSurface('overflow', this.overflowOpen, () => {
      this.overflowOpen = false;
    });
    this.syncMobileBackSurface('aiMenu', this.aiMenuOpen, () => {
      this.aiMenuOpen = false;
    });
    this.syncMobileBackSurface('panelAdjust', this.panelAdjustOpen, () => {
      this.panelAdjustOpen = false;
    });
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

  private syncMobileBackSurface(surface: CbxHeaderMobileSurface, isOpen: boolean, close: () => void): void {
    const existingHandle = this.mobileBackHandles[surface];

    if (isOpen) {
      if (!existingHandle) {
        this.mobileBackHandles[surface] = this.mobileBackNavigation.register(close);
      }
      return;
    }

    existingHandle?.release();
    delete this.mobileBackHandles[surface];
  }

  private releaseAllMobileBackRegistrations(removeHistoryEntry: boolean): void {
    const surfaces = Object.keys(this.mobileBackHandles) as CbxHeaderMobileSurface[];
    for (const surface of surfaces) {
      this.mobileBackHandles[surface]?.release(removeHistoryEntry);
      delete this.mobileBackHandles[surface];
    }
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
