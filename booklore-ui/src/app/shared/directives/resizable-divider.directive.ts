import { Directive, ElementRef, Input, OnDestroy, OnInit, Renderer2, inject } from '@angular/core';
import { MobileUxService } from '../../core/services/mobile-ux.service';

/**
 * Adds a drag handle to a panel so users can resize it by hover + click + drag.
 * The handle is absolutely positioned relative to the target element.
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
  private animationLoopStart = 0;

  private el = inject(ElementRef);
  private renderer = inject(Renderer2);
  private mobileUx = inject(MobileUxService);

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
    this.renderer.setStyle(this.handle, 'z-index', '9999');
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
    this.renderer.setStyle(this.grip, 'background', 'color-mix(in srgb, var(--primary-color) 55%, transparent)');
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

    // Watch DOM mutations so overlays/dialogs immediately hide the handle.
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => {
        this.scheduleUpdateHandlePosition();
        
        // Kick off a fallback rAF loop for 400ms to track Angular animations
        // that don't trigger native transitionstart events.
        this.animationLoopStart = performance.now();
        if (!this.animationLoopId) {
          const loop = (now: number) => {
            this.scheduleUpdateHandlePosition();
            if (now - this.animationLoopStart < 400) {
              this.animationLoopId = requestAnimationFrame(loop);
            } else {
              this.animationLoopId = null;
            }
          };
          this.animationLoopId = requestAnimationFrame(loop);
        }
      });
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
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

    // Hover styles
    this.handle.addEventListener('mouseenter', () => {
      if (this.isTouchHandleMode()) {
        return;
      }
      this.renderer.setStyle(this.handle, 'background', 'var(--p-primary-color, #818cf8)');
      this.renderer.setStyle(this.handle, 'opacity', '0.5');
      this.renderer.setStyle(this.handle, 'border-radius', '3px');
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

    const onPointerUp = (e?: PointerEvent) => {
      if (this.dragging) {
        this.dragging = false;
        if (e && this.activePointerId !== null && e.pointerId === this.activePointerId) {
          this.handle.releasePointerCapture?.(e.pointerId);
        }
        this.activePointerId = null;
        this.renderer.removeClass(document.body, 'bl-resizing');
        this.applyHandlePresentation();
      }
    };

    this.unlisten.push(
      this.renderer.listen(this.handle, 'pointerdown', onPointerDown),
      this.renderer.listen(document, 'pointermove', onPointerMove),
      this.renderer.listen(document, 'pointerup', onPointerUp),
      this.renderer.listen(document, 'pointercancel', onPointerUp),
    );
  }

  private isTouchHandleMode(): boolean {
    return this.mobileUx.isMobileOrTablet;
  }

  private applyHandlePresentation(): void {
    if (!this.handle) {
      return;
    }

    if (this.isTouchHandleMode()) {
      this.renderer.setStyle(this.handle, 'width', '30px');
      this.renderer.setStyle(this.handle, 'height', '47px');
      this.renderer.setStyle(this.handle, 'cursor', 'grab');
      this.renderer.setStyle(this.handle, 'background', 'transparent');
      this.renderer.setStyle(this.handle, 'opacity', '1');
      this.renderer.removeStyle(this.handle, 'border-radius');
      this.renderer.removeStyle(this.handle, 'box-shadow');
      
      this.renderer.setStyle(this.grip, 'opacity', '1');
      this.renderer.setStyle(this.grip, 'width', '2px');
      this.renderer.setStyle(this.grip, 'height', '31px');
      this.renderer.setStyle(this.grip, 'background', 'color-mix(in srgb, white 78%, var(--primary-color) 22%)');
      this.renderer.setStyle(this.grip, 'border-radius', '1px');
      this.renderer.setStyle(this.grip, 'box-shadow', '0 0 0 2px color-mix(in srgb, var(--primary-color) 82%, white 18%), 0 0 0 4px color-mix(in srgb, var(--surface-card, white) 88%, transparent), 0 3px 8px rgba(0, 0, 0, 0.15)');
      
      this.renderer.removeStyle(this.grip, 'transform');
      this.renderer.setStyle(this.grip, 'top', '8px');
      
      if (this.blResizable === 'right') {
        this.renderer.setStyle(this.grip, 'left', '17px');
      } else {
        this.renderer.setStyle(this.grip, 'left', '11px');
      }
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
      this.renderer.setStyle(this.grip, 'background', 'color-mix(in srgb, var(--primary-color) 55%, transparent)');
      this.renderer.removeStyle(this.grip, 'box-shadow');
      this.renderer.setStyle(this.grip, 'top', '50%');
      this.renderer.setStyle(this.grip, 'left', '50%');
      this.renderer.setStyle(this.grip, 'transform', 'translate(-50%, -50%)');
    }
  }

  private getAccumulatedOpacity(element: HTMLElement): number {
    let opacity = 1;
    let curr: HTMLElement | null = element;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const style = getComputedStyle(curr);
      const val = parseFloat(style.opacity || '1');
      if (val < 1) {
        opacity *= val;
      }
      if (style.display === 'none' || style.visibility === 'hidden') {
        return 0;
      }
      curr = curr.parentElement;
    }
    return opacity;
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
    if (this.isTouchHandleMode()) {
      const touchHandleHeight = 47;
      const top = rect.top + Math.max(12, (rect.height - touchHandleHeight) / 2);
      this.renderer.setStyle(this.handle, 'top', top + 'px');
      this.renderer.setStyle(this.handle, 'height', touchHandleHeight + 'px');
    } else {
      this.renderer.setStyle(this.handle, 'top', rect.top + 'px');
      this.renderer.setStyle(this.handle, 'height', rect.height + 'px');
    }

    if (this.blResizable === 'right') {
      const offset = this.isTouchHandleMode() ? 15 : 3;
      this.renderer.setStyle(this.handle, 'left', (rect.right - offset) + 'px');
    } else {
      const offset = this.isTouchHandleMode() ? 15 : 3;
      this.renderer.setStyle(this.handle, 'left', (rect.left - offset) + 'px');
    }

    // Apply accumulated opacity so the handle fades out synchronously with the panel
    const accumulatedOpacity = this.getAccumulatedOpacity(this.target);
    if (accumulatedOpacity < 1) {
      this.renderer.setStyle(this.handle, 'opacity', String(accumulatedOpacity));
      if (accumulatedOpacity <= 0) {
        this.renderer.setStyle(this.handle, 'display', 'none');
      }
    }
  }

  private hasVisibleBlockingOverlay(): boolean {
    const overlays = document.querySelectorAll<HTMLElement>(
      '.p-dialog-mask, .p-component-overlay, .p-overlay-mask, .dialog-overlay, .cdk-overlay-backdrop, .cdk-overlay-pane'
    );

    for (const overlay of overlays) {
      if (overlay.contains(this.handle) || overlay === this.handle) {
        continue;
      }
      const style = getComputedStyle(overlay);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      if (overlay.getBoundingClientRect().width <= 0 || overlay.getBoundingClientRect().height <= 0) {
        continue;
      }
      return true;
    }

    return false;
  }

  ngOnDestroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.animationLoopId) cancelAnimationFrame(this.animationLoopId);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.unlisten.forEach(fn => fn());
    if (this.handle && this.handle.parentNode) {
      this.handle.parentNode.removeChild(this.handle);
    }
  }
}
