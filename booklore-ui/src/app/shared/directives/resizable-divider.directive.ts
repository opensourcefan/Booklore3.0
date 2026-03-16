import { Directive, ElementRef, Input, OnDestroy, OnInit, Renderer2 } from '@angular/core';

/**
 * Adds a drag handle to a panel so users can resize it by hover + click + drag.
 * The handle is absolutely positioned relative to the target element.
 * Width is persisted to localStorage via storageKey.
 */
@Directive({ selector: '[blResizable]', standalone: true })
export class ResizableDividerDirective implements OnInit, OnDestroy {
  @Input() blResizable: 'left' | 'right' = 'right';
  @Input() minWidth = 160;
  @Input() maxWidth = 600;
  @Input() storageKey = '';

  private handle!: HTMLElement;
  private dragging = false;
  private startX = 0;
  private startWidth = 0;
  private target!: HTMLElement;
  private unlisten: (() => void)[] = [];
  private rafId: number | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit(): void {
    this.target = this.el.nativeElement as HTMLElement;

    // Restore saved width
    if (this.storageKey) {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const w = parseInt(saved, 10);
        if (!isNaN(w)) {
          this.renderer.setStyle(this.target, 'width', w + 'px');
          if (this.storageKey === 'bl-sidebar-width') {
            document.documentElement.style.setProperty('--sidebar-width', w + 'px');
          }
        }
      }
    }

    // Create handle and append to body — avoids any position context issues
    this.handle = this.renderer.createElement('div');
    this.renderer.addClass(this.handle, 'bl-resize-handle');
    this.renderer.addClass(this.handle, `bl-resize-handle--${this.blResizable}`);
    this.renderer.setStyle(this.handle, 'position', 'fixed');
    this.renderer.setStyle(this.handle, 'width', '6px');
    this.renderer.setStyle(this.handle, 'cursor', 'col-resize');
    this.renderer.setStyle(this.handle, 'z-index', '9999');
    this.renderer.setStyle(this.handle, 'background', 'transparent');
    this.renderer.setStyle(this.handle, 'transition', 'background 0.15s ease');
    this.renderer.appendChild(document.body, this.handle);

    // Position handle over the correct edge of the target
    this.updateHandlePosition();

    // Keep handle positioned correctly on scroll/resize
    const updatePos = () => this.updateHandlePosition();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    this.unlisten.push(
      () => window.removeEventListener('resize', updatePos),
      () => window.removeEventListener('scroll', updatePos, true)
    );

    // Hover styles
    this.handle.addEventListener('mouseenter', () => {
      this.renderer.setStyle(this.handle, 'background', 'var(--p-primary-color, #818cf8)');
      this.renderer.setStyle(this.handle, 'opacity', '0.5');
      this.renderer.setStyle(this.handle, 'border-radius', '3px');
    });
    this.handle.addEventListener('mouseleave', () => {
      if (!this.dragging) {
        this.renderer.setStyle(this.handle, 'background', 'transparent');
        this.renderer.setStyle(this.handle, 'opacity', '1');
      }
    });

    const onMouseDown = (e: MouseEvent) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.startWidth = this.target.offsetWidth;
      this.renderer.addClass(document.body, 'bl-resizing');
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.dragging) return;
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
        if (this.storageKey === 'bl-sidebar-width') {
          document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        }
        this.updateHandlePosition();
      });
    };

    const onMouseUp = () => {
      if (this.dragging) {
        this.dragging = false;
        this.renderer.removeClass(document.body, 'bl-resizing');
        this.renderer.setStyle(this.handle, 'background', 'transparent');
        this.renderer.setStyle(this.handle, 'opacity', '1');
      }
    };

    this.unlisten.push(
      this.renderer.listen(this.handle, 'mousedown', onMouseDown),
      this.renderer.listen(document, 'mousemove', onMouseMove),
      this.renderer.listen(document, 'mouseup', onMouseUp),
    );
  }

  private updateHandlePosition(): void {
    if (!this.handle || !this.target) return;
    const rect = this.target.getBoundingClientRect();
    this.renderer.setStyle(this.handle, 'top', rect.top + 'px');
    this.renderer.setStyle(this.handle, 'height', rect.height + 'px');
    if (this.blResizable === 'right') {
      this.renderer.setStyle(this.handle, 'left', (rect.right - 3) + 'px');
    } else {
      this.renderer.setStyle(this.handle, 'left', (rect.left - 3) + 'px');
    }
  }

  ngOnDestroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.unlisten.forEach(fn => fn());
    if (this.handle && this.handle.parentNode) {
      this.handle.parentNode.removeChild(this.handle);
    }
  }
}
