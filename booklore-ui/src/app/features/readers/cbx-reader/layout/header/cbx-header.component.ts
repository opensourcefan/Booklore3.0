import {Component, DoCheck, ElementRef, EventEmitter, HostListener, inject, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {TranslocoPipe} from '@jsverse/transloco';
import {CbxHeaderService, CbxHeaderState} from './cbx-header.service';
import {ReaderIconComponent} from '../../../ebook-reader';
import {CommonModule} from '@angular/common';
import {MobileBackHandle, MobileBackNavigationService} from '../../../../../shared/service/mobile-back-navigation.service';
import {CbxJoystickSensitivity} from '../quick-settings/cbx-quick-settings.service';
import { clamp } from '../../../../../core/utils/math.utils';

type CbxHeaderMobileSurface = 'overflow' | 'aiMenu' | 'panelAdjust' | 'joystickMenu';

@Component({
  selector: 'app-cbx-header',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReaderIconComponent],
  templateUrl: './cbx-header.component.html',
  styleUrls: ['./cbx-header.component.scss']
})
export class CbxHeaderComponent implements OnInit, OnDestroy, DoCheck {
  private static readonly JOYSTICK_MENU_VIEWPORT_GUTTER_PX = 8;
  private static readonly JOYSTICK_MENU_TOP_OFFSET_PX = 4;
  private static readonly JOYSTICK_MENU_FALLBACK_WIDTH_PX = 320;
  private static readonly JOYSTICK_MENU_MIN_WIDTH_PX = 220;
  private static readonly JOYSTICK_MENU_MIN_HEIGHT_PX = 140;

  private headerService = inject(CbxHeaderService);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private destroy$ = new Subject<void>();
  private mobileBackHandles: Partial<Record<CbxHeaderMobileSurface, MobileBackHandle>> = {};
  private joystickMenuAnchorRect: DOMRect | null = null;

  @ViewChild('joystickDropdown') joystickDropdownRef?: ElementRef<HTMLDivElement>;

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
  @Input() joystickEnabled = false;
  @Input() joystickSensitivity: CbxJoystickSensitivity = 'NORMAL';
  @Input() joystickPositionLocked = true;
  @Input() joystickRecenterOnTouch = true;
  @Input() joystickIndicatorVisible = true;
  @Input() joystickIndicatorOpacity = 0.88;

  @Output() aiPanelDetection = new EventEmitter<void>();
  @Output() aiRescan = new EventEmitter<void>();
  @Output() aiDeleteScan = new EventEmitter<void>();
  @Output() aiOpenSettings = new EventEmitter<void>();
  @Output() togglePin = new EventEmitter<void>();
  @Output() panelTravelFactorChange = new EventEmitter<number>();
  @Output() panelZoomOut = new EventEmitter<void>();
  @Output() panelZoomIn = new EventEmitter<void>();
  @Output() toggleJoystick = new EventEmitter<void>();
  @Output() toggleJoystickPositionLock = new EventEmitter<void>();
  @Output() joystickSensitivityChange = new EventEmitter<CbxJoystickSensitivity>();
  @Output() joystickRecenterOnTouchChange = new EventEmitter<boolean>();
  @Output() joystickIndicatorVisibleChange = new EventEmitter<boolean>();
  @Output() joystickIndicatorOpacityChange = new EventEmitter<number>();

  isVisible = true;
  overflowOpen = false;
  aiMenuOpen = false;
  panelAdjustOpen = false;
  joystickMenuOpen = false;
  joystickMenuStyle: Record<string, string> = {};
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
    this.syncMobileBackSurface('joystickMenu', this.joystickMenuOpen, () => {
      this.closeJoystickMenu();
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleJoystickMenuPositioning();
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
      this.closeJoystickMenu();
    }
  }

  closeMenus(): void {
    this.aiMenuOpen = false;
    this.overflowOpen = false;
    this.panelAdjustOpen = false;
    this.closeJoystickMenu();
  }

  closeJoystickMenu(): void {
    this.joystickMenuOpen = false;
    this.joystickMenuStyle = {};
    this.joystickMenuAnchorRect = null;
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
    if (this.panelAdjustOpen) {
      this.closeJoystickMenu();
      this.overflowOpen = false;
    }
  }

  onToggleJoystickMenu(event: MouseEvent): void {
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement | null;
    this.joystickMenuOpen = !this.joystickMenuOpen;

    if (this.joystickMenuOpen) {
      this.overflowOpen = false;
      this.aiMenuOpen = false;
      this.panelAdjustOpen = false;
      this.joystickMenuAnchorRect = trigger?.getBoundingClientRect() ?? this.joystickMenuAnchorRect;
      this.scheduleJoystickMenuPositioning();
    } else {
      this.closeJoystickMenu();
    }
  }

  onToggleOverflowMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.overflowOpen = !this.overflowOpen;
    if (this.overflowOpen) {
      this.closeJoystickMenu();
      this.aiMenuOpen = false;
      this.panelAdjustOpen = false;
    }
  }

  private scheduleJoystickMenuPositioning(): void {
    if (!this.joystickMenuOpen) {
      return;
    }

    setTimeout(() => this.positionJoystickMenuWithinViewport());
  }

  private positionJoystickMenuWithinViewport(): void {
    if (!this.joystickMenuOpen) {
      return;
    }

    const dropdown = this.joystickDropdownRef?.nativeElement;
    if (!dropdown) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gutter = CbxHeaderComponent.JOYSTICK_MENU_VIEWPORT_GUTTER_PX;
    const anchorRight = this.joystickMenuAnchorRect?.right ?? (viewportWidth - gutter);
    const anchorBottom = this.joystickMenuAnchorRect?.bottom ?? 40;
    const measuredWidth = dropdown.offsetWidth > 0
      ? dropdown.offsetWidth
      : CbxHeaderComponent.JOYSTICK_MENU_FALLBACK_WIDTH_PX;
    const maxUsableWidth = Math.max(
      CbxHeaderComponent.JOYSTICK_MENU_MIN_WIDTH_PX,
      viewportWidth - (gutter * 2)
    );
    const width = Math.min(measuredWidth, maxUsableWidth);
    const left = this.clamp(anchorRight - width, gutter, viewportWidth - width - gutter);
    const top = Math.max(gutter, anchorBottom + CbxHeaderComponent.JOYSTICK_MENU_TOP_OFFSET_PX);
    const maxHeight = Math.max(
      CbxHeaderComponent.JOYSTICK_MENU_MIN_HEIGHT_PX,
      viewportHeight - top - gutter
    );

    this.joystickMenuStyle = {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.round(maxHeight)}px`
    };
  }

  private clamp(value: number, min: number, max: number): number {
    if (max < min) {
      return min;
    }

    return clamp(min, value, max);
  }

  onPanelTravelDelta(delta: number): void {
    const next = clamp(0.4, this.panelTravelFactor + delta, 2.5);
    this.panelTravelFactorChange.emit(Number(next.toFixed(2)));
  }

  onPanelTravelInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = Number(target.value);
    if (Number.isFinite(value)) {
      this.panelTravelFactorChange.emit(clamp(0.4, value, 2.5));
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

  onToggleJoystick(): void {
    this.toggleJoystick.emit();
  }

  onJoystickEnabledSelect(enabled: boolean): void {
    if (this.joystickEnabled === enabled) {
      return;
    }

    const isTurningOff = this.joystickEnabled && !enabled;
    this.toggleJoystick.emit();

    if (isTurningOff) {
      this.closeJoystickMenu();
    }
  }

  onToggleJoystickPositionLock(): void {
    this.toggleJoystickPositionLock.emit();
  }

  onJoystickSensitivitySelect(sensitivity: CbxJoystickSensitivity): void {
    this.joystickSensitivityChange.emit(sensitivity);
  }

  onJoystickRecenterOnTouchChange(enabled: boolean): void {
    this.joystickRecenterOnTouchChange.emit(enabled);
  }

  onJoystickIndicatorVisibleChange(visible: boolean): void {
    this.joystickIndicatorVisibleChange.emit(visible);
  }

  onJoystickIndicatorOpacityInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    const opacity = Number(target.value) / 100;
    this.joystickIndicatorOpacityChange.emit(opacity);
  }

  onClose(): void {
    this.headerService.close();
  }
}
