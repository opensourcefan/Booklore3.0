import { Directive, ElementRef, Input, OnDestroy, OnInit, Renderer2, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MobileUxService } from '../../core/services/mobile-ux.service';
import { UiPreferencesService } from '../service/ui-preferences.service';
import { addFullscreenChangeListener } from '../util/fullscreen.util';

/**
 * Adds a drag handle to a panel so users can resize it.
 * - Mouse desktop: thin hover-to-reveal edge handle
 * - Touch / tablet / enabled preference: always-visible thumb-friendly grip
 * Width is persisted to localStorage via storageKey.
 */
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[blResizable]', standalone: true })
export class ResizableDividerDirective implements OnInit, OnDestroy {
  @Input() blResizable: 'left' | 'right' = 'right';
  @Input() minWidth = 160;
  @Input() maxWidth = 600;
  @Input() storageKey = '';
  /** Optional CSS variable to update on resize (e.g. '--dir-panel-width'). */
  @Input() cssVar = '';

  private handle!: HTMLElement;
  private grip!: HTMLElement;
  private dragging = false;
  private activePointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startScrollTop = 0;
  private target!: HTMLElement;
  private unlisten: (() => void)[] = [];
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private updateScheduled = false;
  private isTransitioning = false;
  private animationLoopId: number | null = null;
  private prefsSub: Subscription | null = null;

  private el = inject(ElementRef);
  private renderer = inject(Renderer2);
  private mobileUx = inject(MobileUxService);
  private uiPrefs = inject(UiPreferencesService);

  /** Match panel borders — not theme primary. */
  private static readonly GRIP_COLOR = 'var(--p-content-border-color, var(--border-color, #3f3f46))';

  ngOnInit(): void {
    this.target = this.el.nativeElement as HTMLElement;

    // Restore saved width
    if (this.storageKey) {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const w = parseInt(saved, 10);
        if (!isNaN(w)) {
          this.renderer.setStyle(this.target, 'width', w + 'px');
          if (this.cssVar) {
            document.documentElement.style.setProperty(this.cssVar, w + 'px');
          } else if (this.storageKey === 'bl-sidebar-width') {
            document.documentElement.style.setProperty('--sidebar-width', w + 'px');
          }
        }
      }
    }

    // Create handle and append to body — avoids any position context issues
    this.handle = this.renderer.createElement('div');
    this.grip = this.renderer.createElement('div');
    this.renderer.addClass(this.handle, 'bl-resize-handle');
    this.renderer.addClass(this.handle, `bl-resize-handle--${this.blResizable}`);
    this.renderer.setStyle(this.handle, 'position', 'fixed');
    this.renderer.setStyle(this.handle, 'width', '6px');
    this.renderer.setStyle(this.handle, 'cursor', 'col-resize');
    // Sit above the fixed side panels (layout-sidebar is z-index 999) and the
    // topbar (997) so the whole grip is on the panel edge and draggable, but
    // below PrimeNG overlays/menus/popovers (first instance renders at 1001)
    // so it never draws over the topbar toolbar-sort popover.
    this.renderer.setStyle(this.handle, 'z-index', '1000');
    this.renderer.setStyle(this.handle, 'background', 'transparent');
    this.renderer.setStyle(this.handle, 'transition', 'background 0.15s ease');
    this.renderer.setStyle(this.handle, 'touch-action', 'none');
    this.renderer.setAttribute(this.handle, 'aria-hidden', 'true');
    this.renderer.setStyle(this.grip, 'position', 'absolute');
    this.renderer.setStyle(this.grip, 'top', '50%');
    this.renderer.setStyle(this.grip, 'left', '50%');
    this.renderer.setStyle(this.grip, 'transform', 'translate(-50%, -50%)');
    this.renderer.setStyle(this.grip, 'width', '4px');
    this.renderer.setStyle(this.grip, 'height', '44px');
    this.renderer.setStyle(this.grip, 'border-radius', '999px');
    this.renderer.setStyle(this.grip, 'background', ResizableDividerDirective.GRIP_COLOR);
    this.renderer.setStyle(this.grip, 'opacity', '0');
    this.renderer.setStyle(this.grip, 'transition', 'opacity 0.15s ease, background 0.15s ease');
    this.renderer.appendChild(this.handle, this.grip);
    this.renderer.appendChild(document.body, this.handle);

    // Position handle over the correct edge of the target
    this.scheduleUpdateHandlePosition();
    requestAnimationFrame(() => this.scheduleUpdateHandlePosition());
    requestAnimationFrame(() => this.scheduleUpdateHandlePosition());

    // Keep handle synced when target dimensions change without window resize events
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleUpdateHandlePosition());
      this.resizeObserver.observe(this.target);
    }

    // Keep handle positioned correctly on scroll/resize
    const updatePos = () => this.scheduleUpdateHandlePosition();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    this.unlisten.push(
      () => window.removeEventListener('resize', updatePos),
      () => window.removeEventListener('scroll', updatePos, true)
    );

    // Watch DOM mutations on body so overlays/dialogs immediately hide the handle.
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => {
        this.scheduleUpdateHandlePosition();
      });
      this.mutationObserver.observe(document.body, {
        childList: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }

    // Track CSS transitions so the handle stays attached while panels slide open/closed
    const onTransitionStart = () => {
      if (!this.isTransitioning) {
        this.isTransitioning = true;
        const loop = () => {
          this.scheduleUpdateHandlePosition();
          if (this.isTransitioning) {
            requestAnimationFrame(loop);
          }
        };
        requestAnimationFrame(loop);
      }
    };
    const onTransitionEnd = () => {
      this.isTransitioning = false;
      this.scheduleUpdateHandlePosition();
    };

    this.target.addEventListener('transitionstart', onTransitionStart);
    this.target.addEventListener('transitionend', onTransitionEnd);
    this.target.addEventListener('transitioncancel', onTransitionEnd);

    this.unlisten.push(
      () => this.target.removeEventListener('transitionstart', onTransitionStart),
      () => this.target.removeEventListener('transitionend', onTransitionEnd),
      () => this.target.removeEventListener('transitioncancel', onTransitionEnd)
    );

    // Re-apply presentation when the user toggles always-visible handles
    this.prefsSub = this.uiPrefs.showResizeHandles$.subscribe(() => {
      this.scheduleUpdateHandlePosition();
    });

    // Hover styles (desktop mouse only)
    this.handle.addEventListener('mouseenter', () => {
      if (this.isThumbHandleMode()) {
        return;
      }
      this.renderer.setStyle(this.handle, 'background', ResizableDividerDirective.GRIP_COLOR);
      this.renderer.setStyle(this.handle, 'opacity', '0.5');
      this.renderer.setStyle(this.handle, 'border-radius', '3px');
      this.renderer.setStyle(this.grip, 'opacity', '1');
    });
    this.handle.addEventListener('mouseleave', () => {
      if (!this.dragging) {
        this.applyHandlePresentation();
      }
    });

    const onPointerDown = (e: PointerEvent) => {
      this.dragging = true;
      this.activePointerId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startWidth = this.target.offsetWidth;
      this.startScrollTop = this.getScrollContainer()?.scrollTop ?? 0;
      this.renderer.addClass(document.body, 'bl-resizing');
      this.handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragging || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) {
        return;
      }
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        const delta = this.blResizable === 'right'
          ? e.clientX - this.startX
          : this.startX - e.clientX;
        const newWidth = Math.min(this.maxWidth, Math.max(this.minWidth, this.startWidth + delta));
        this.renderer.setStyle(this.target, 'width', newWidth + 'px');
        if (this.storageKey) {
          localStorage.setItem(this.storageKey, String(newWidth));
        }
        if (this.cssVar) {
          document.documentElement.style.setProperty(this.cssVar, newWidth + 'px');
        } else if (this.storageKey === 'bl-sidebar-width') {
          document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        }

        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
          const deltaY = e.clientY - this.startY;
          scrollContainer.scrollTop = this.startScrollTop + deltaY;
        }

        this.scheduleUpdateHandlePosition();
      });
      e.preventDefault();
    };

    const endDrag = (e?: PointerEvent) => {
      if (!this.dragging) {
        return;
      }
      this.dragging = false;
      const pointerId = e?.pointerId ?? this.activePointerId;
      if (pointerId !== null) {
        try {
          this.handle.releasePointerCapture?.(pointerId);
        } catch {
          // Capture may already be gone after fullscreen / lostpointercapture.
        }
      }
      this.activePointerId = null;
      this.renderer.removeClass(document.body, 'bl-resizing');
      this.applyHandlePresentation();
    };

    const onFullscreenChange = () => {
      endDrag();
      this.scheduleUpdateHandlePosition();
    };

    this.unlisten.push(
      this.renderer.listen(this.handle, 'pointerdown', onPointerDown),
      this.renderer.listen(this.handle, 'lostpointercapture', () => endDrag()),
      this.renderer.listen(document, 'pointermove', onPointerMove),
      this.renderer.listen(document, 'pointerup', endDrag),
      this.renderer.listen(document, 'pointercancel', endDrag),
      addFullscreenChangeListener(onFullscreenChange),
    );
  }

  /**
   * Thumb-friendly always-visible grips when:
   * - user enabled "Show drag handles", OR
   * - device reports touch input (covers tablet desktop mode), OR
   * - layout is phone/tablet
   */
  private isThumbHandleMode(): boolean {
    return this.uiPrefs.showResizeHandles
      || this.mobileUx.hasTouchInput
      || this.mobileUx.isMobileOrTablet;
  }

  private applyHandlePresentation(): void {
    if (!this.handle) {
      return;
    }

    if (this.isThumbHandleMode()) {
      this.renderer.setStyle(this.handle, 'width', '28px');
      this.renderer.setStyle(this.handle, 'height', '56px');
      this.renderer.setStyle(this.handle, 'cursor', 'grab');
      this.renderer.setStyle(this.handle, 'background', 'transparent');
      this.renderer.setStyle(this.handle, 'opacity', '1');
      this.renderer.removeStyle(this.handle, 'border-radius');
      this.renderer.removeStyle(this.handle, 'box-shadow');

      this.renderer.setStyle(this.grip, 'opacity', '1');
      this.renderer.setStyle(this.grip, 'width', '6px');
      this.renderer.setStyle(this.grip, 'height', '40px');
      this.renderer.setStyle(this.grip, 'background', ResizableDividerDirective.GRIP_COLOR);
      this.renderer.setStyle(this.grip, 'border-radius', '999px');
      this.renderer.setStyle(this.grip, 'box-shadow', '0 0 0 1px color-mix(in srgb, var(--p-content-border-color, #3f3f46) 80%, transparent), 0 2px 6px rgba(0, 0, 0, 0.25)');
      this.renderer.setStyle(this.grip, 'top', '50%');
      this.renderer.setStyle(this.grip, 'left', '50%');
      this.renderer.setStyle(this.grip, 'transform', 'translate(-50%, -50%)');
    } else {
      this.renderer.setStyle(this.handle, 'width', '6px');
      this.renderer.setStyle(this.handle, 'height', '100%');
      this.renderer.setStyle(this.handle, 'cursor', 'col-resize');
      this.renderer.setStyle(this.handle, 'background', 'transparent');
      this.renderer.setStyle(this.handle, 'opacity', '1');
      this.renderer.removeStyle(this.handle, 'border-radius');
      this.renderer.removeStyle(this.handle, 'box-shadow');

      this.renderer.setStyle(this.grip, 'opacity', '0');
      this.renderer.setStyle(this.grip, 'width', '4px');
      this.renderer.setStyle(this.grip, 'height', '44px');
      this.renderer.setStyle(this.grip, 'background', ResizableDividerDirective.GRIP_COLOR);
      this.renderer.removeStyle(this.grip, 'box-shadow');
      this.renderer.setStyle(this.grip, 'top', '50%');
      this.renderer.setStyle(this.grip, 'left', '50%');
      this.renderer.setStyle(this.grip, 'transform', 'translate(-50%, -50%)');
    }
  }

  private getScrollContainer(): HTMLElement | null {
    const candidates = [
      this.target,
      ...Array.from(this.target.querySelectorAll<HTMLElement>('*')),
    ];

    return candidates.find(element => {
      const style = getComputedStyle(element);
      const allowsScroll = /(auto|scroll|overlay)/.test(style.overflowY);
      return allowsScroll && element.scrollHeight > element.clientHeight + 8;
    }) ?? null;
  }

  private scheduleUpdateHandlePosition(): void {
    if (this.updateScheduled) {
      return;
    }
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.updateHandlePosition();
    });
  }

  private updateHandlePosition(): void {
    if (!this.handle || !this.target) return;

    if (!this.dragging && this.hasVisibleBlockingOverlay()) {
      this.renderer.setStyle(this.handle, 'display', 'none');
      return;
    }

    const rect = this.target.getBoundingClientRect();
    const style = getComputedStyle(this.target);
    const isVisible = rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth
      && style.display !== 'none'
      && style.visibility !== 'hidden';

    if (!isVisible) {
      this.renderer.setStyle(this.handle, 'display', 'none');
      return;
    }

    this.renderer.removeStyle(this.handle, 'display');
    this.applyHandlePresentation();
    if (this.isThumbHandleMode()) {
      // Keep the grip in the lower reach zone for a thumb holding a tablet.
      // The inset scales for short panels but is capped so tall panels do not
      // push the handle too far upward.
      const touchHandleHeight = 56;
      const bottomInset = Math.min(96, Math.max(24, rect.height * 0.12));
      const top = Math.max(rect.top + 12, rect.bottom - touchHandleHeight - bottomInset);
      this.renderer.setStyle(this.handle, 'top', top + 'px');
      this.renderer.setStyle(this.handle, 'height', touchHandleHeight + 'px');
    } else {
      this.renderer.setStyle(this.handle, 'top', rect.top + 'px');
      this.renderer.setStyle(this.handle, 'height', rect.height + 'px');
    }

    if (this.blResizable === 'right') {
      const offset = this.isThumbHandleMode() ? 14 : 3;
      this.renderer.setStyle(this.handle, 'left', (rect.right - offset) + 'px');
    } else {
      const offset = this.isThumbHandleMode() ? 14 : 3;
      this.renderer.setStyle(this.handle, 'left', (rect.left - offset) + 'px');
    }
  }

  private hasVisibleBlockingOverlay(): boolean {
    if (document.body.classList.contains('p-overflow-hidden') || document.documentElement.classList.contains('cdk-global-scrollblock')) {
      return true;
    }
    // Note: do NOT treat .p-popover as blocking. Some resizable panels (mobile
    // sidebar, mobile filter) are hosted inside popovers while their handle lives
    // on document.body; the handle sits below popovers by z-index (1000 < 1001),
    // so the toolbar-sort popover is never covered without hiding those handles.
    const overlay = document.querySelector('.p-dialog-mask, .p-component-overlay, .p-overlay-mask, .dialog-overlay, .cdk-overlay-backdrop, .cdk-overlay-pane');
    if (overlay && (overlay.contains(this.handle) || overlay === this.handle)) {
      return false;
    }
    return overlay !== null;
  }

  ngOnDestroy(): void {
    if (this.dragging) {
      this.dragging = false;
      this.activePointerId = null;
      this.renderer.removeClass(document.body, 'bl-resizing');
    }
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.animationLoopId) cancelAnimationFrame(this.animationLoopId);
    this.prefsSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.unlisten.forEach(fn => fn());
    if (this.handle && this.handle.parentNode) {
      this.handle.parentNode.removeChild(this.handle);
    }
  }
}
