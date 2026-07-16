import {Injectable, OnDestroy, inject} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {Subscription, combineLatest} from 'rxjs';
import {filter, startWith} from 'rxjs/operators';
import {MobileUxService} from './mobile-ux.service';
import {UiPreferencesService} from '../../shared/service/ui-preferences.service';
import {MobileBackNavigationService} from '../../shared/service/mobile-back-navigation.service';
import {DialogLauncherService, DialogSize} from '../../shared/services/dialog-launcher.service';
import {KioskActionsSheetComponent} from '../../shared/components/kiosk-actions-sheet/kiosk-actions-sheet.component';

/**
 * Opt-in tablet/kiosk gestures. Hard-disabled in Phone Mode.
 * - contextmenu suppress (keep app long-press)
 * - edge swipe history (Pointer Events, touch only)
 * - 3-finger tap → kiosk action sheet
 */
@Injectable({providedIn: 'root'})
export class TabletNavigationGesturesService implements OnDestroy {
  private readonly EDGE_INSET_PX = 28;
  private readonly MIN_SWIPE_PX = 80;
  private readonly MAX_VERTICAL_DRIFT_PX = 40;
  private readonly THREE_FINGER_MAX_DURATION_MS = 450;
  private readonly THREE_FINGER_MAX_MOVE_PX = 36;
  private readonly BODY_CLASS = 'tablet-nav-gestures';
  private readonly READER_URL_RE = /\/(ebook-reader|cbx-reader|pdf-reader)\//;

  private readonly uiPrefs = inject(UiPreferencesService);
  private readonly mobileUx = inject(MobileUxService);
  private readonly mobileBack = inject(MobileBackNavigationService);
  private readonly dialogLauncher = inject(DialogLauncherService);
  private readonly router = inject(Router);

  private enabled = false;
  private onReaderRoute = false;
  private sub = new Subscription();

  private edgePointerId: number | null = null;
  private edgeStartX = 0;
  private edgeStartY = 0;
  private edgeFrom: 'left' | 'right' | null = null;

  private threeFingerActive = false;
  private threeFingerStartMs = 0;
  private threeFingerOriginById = new Map<number, {x: number; y: number}>();

  private readonly onContextMenu = (event: Event): void => {
    if (!this.enabled) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (this.allowsNativeContextMenu(target)) {
      return;
    }
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.onReaderRoute || event.pointerType !== 'touch') {
      return;
    }
    if (this.shouldIgnoreEdgeTarget(event.target)) {
      return;
    }

    const width = window.innerWidth;
    if (event.clientX <= this.EDGE_INSET_PX) {
      this.edgePointerId = event.pointerId;
      this.edgeStartX = event.clientX;
      this.edgeStartY = event.clientY;
      this.edgeFrom = 'left';
      return;
    }
    if (event.clientX >= width - this.EDGE_INSET_PX) {
      this.edgePointerId = event.pointerId;
      this.edgeStartX = event.clientX;
      this.edgeStartY = event.clientY;
      this.edgeFrom = 'right';
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.edgePointerId == null || event.pointerId !== this.edgePointerId) {
      return;
    }

    const from = this.edgeFrom;
    const startX = this.edgeStartX;
    const startY = this.edgeStartY;
    this.clearEdgeGesture();

    if (!this.enabled || this.onReaderRoute || !from || event.pointerType !== 'touch') {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = Math.abs(event.clientY - startY);
    if (deltaY > this.MAX_VERTICAL_DRIFT_PX) {
      return;
    }

    // Right-edge left-swipe → back; left-edge right-swipe → forward
    if (from === 'right' && deltaX <= -this.MIN_SWIPE_PX) {
      this.mobileBack.requestBack();
      return;
    }
    if (from === 'left' && deltaX >= this.MIN_SWIPE_PX && !this.mobileBack.hasOverlayEntry) {
      window.history.forward();
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.edgePointerId != null && event.pointerId === this.edgePointerId) {
      this.clearEdgeGesture();
    }
  };

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (!this.enabled || event.touches.length !== 3) {
      this.threeFingerActive = false;
      this.threeFingerOriginById.clear();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && navigator.maxTouchPoints < 3) {
      return;
    }

    this.threeFingerActive = true;
    this.threeFingerStartMs = Date.now();
    this.threeFingerOriginById.clear();
    Array.from(event.touches).forEach(touch => {
      this.threeFingerOriginById.set(touch.identifier, {x: touch.clientX, y: touch.clientY});
    });
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.threeFingerActive) {
      return;
    }
    for (const touch of Array.from(event.touches)) {
      const origin = this.threeFingerOriginById.get(touch.identifier);
      if (!origin) {
        continue;
      }
      if (Math.hypot(origin.x - touch.clientX, origin.y - touch.clientY) > this.THREE_FINGER_MAX_MOVE_PX) {
        this.threeFingerActive = false;
        this.threeFingerOriginById.clear();
        return;
      }
    }
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    if (!this.threeFingerActive) {
      return;
    }

    // Wait until all fingers are up so a staggered lift still counts as one tap.
    if (event.touches.length > 0) {
      return;
    }

    const duration = Date.now() - this.threeFingerStartMs;
    const wasThreeFinger = this.threeFingerOriginById.size === 3;
    this.threeFingerActive = false;
    this.threeFingerOriginById.clear();

    if (this.enabled && wasThreeFinger && duration <= this.THREE_FINGER_MAX_DURATION_MS) {
      this.openKioskSheet();
    }
  };

  start(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.sub.add(
      combineLatest([
        this.uiPrefs.tabletNavGestures$,
        this.mobileUx.breakpoint$,
        this.uiPrefs.layoutMode$,
        this.mobileUx.hasTouchInput$
      ]).subscribe(() => this.syncEnabled())
    );

    this.sub.add(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null)
      ).subscribe(() => {
        this.onReaderRoute = this.READER_URL_RE.test(this.router.url);
      })
    );

    document.addEventListener('contextmenu', this.onContextMenu, true);
    document.addEventListener('pointerdown', this.onPointerDown, {passive: true});
    document.addEventListener('pointerup', this.onPointerUp, {passive: true});
    document.addEventListener('pointercancel', this.onPointerCancel, {passive: true});
    document.addEventListener('touchstart', this.onTouchStart, {passive: true});
    document.addEventListener('touchmove', this.onTouchMove, {passive: true});
    document.addEventListener('touchend', this.onTouchEnd, {passive: true});
    document.addEventListener('touchcancel', this.onTouchEnd, {passive: true});

    this.syncEnabled();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (typeof document !== 'undefined') {
      document.removeEventListener('contextmenu', this.onContextMenu, true);
      document.removeEventListener('pointerdown', this.onPointerDown);
      document.removeEventListener('pointerup', this.onPointerUp);
      document.removeEventListener('pointercancel', this.onPointerCancel);
      document.removeEventListener('touchstart', this.onTouchStart);
      document.removeEventListener('touchmove', this.onTouchMove);
      document.removeEventListener('touchend', this.onTouchEnd);
      document.removeEventListener('touchcancel', this.onTouchEnd);
      document.body.classList.remove(this.BODY_CLASS);
    }
  }

  /** Test / diagnostics: whether gestures are currently active. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  private syncEnabled(): void {
    const next = this.computeAllowed();
    this.enabled = next;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle(this.BODY_CLASS, next);
    }
    if (!next) {
      this.clearEdgeGesture();
      this.threeFingerActive = false;
    }
  }

  private computeAllowed(): boolean {
    if (!this.uiPrefs.tabletNavGestures) {
      return false;
    }
    if (!this.mobileUx.hasTouchInput) {
      return false;
    }
    if (this.uiPrefs.layoutMode === 'phone') {
      return false;
    }
    if (this.mobileUx.isPhone) {
      return false;
    }
    return true;
  }

  private allowsNativeContextMenu(target: HTMLElement | null): boolean {
    if (!target) {
      return false;
    }
    return !!target.closest(
      'input, textarea, select, [contenteditable="true"], [data-allow-context-menu]'
    );
  }

  private shouldIgnoreEdgeTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    return !!target.closest(
      '.image-container, .book-card-mobile-preview, [cdkDragHandle], [data-no-edge-nav], .p-scroller, .p-datatable-table-container'
    );
  }

  private clearEdgeGesture(): void {
    this.edgePointerId = null;
    this.edgeFrom = null;
    this.edgeStartX = 0;
    this.edgeStartY = 0;
  }

  private openKioskSheet(): void {
    this.dialogLauncher.openDialog(KioskActionsSheetComponent, {
      header: 'Kiosk actions',
      showHeader: true,
      modal: true,
      dismissableMask: true,
      styleClass: DialogSize.XS,
      width: '20rem'
    });
  }
}
