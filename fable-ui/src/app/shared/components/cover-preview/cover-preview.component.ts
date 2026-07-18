import { AfterViewInit, Component, ElementRef, Input, OnDestroy, Renderer2, ViewChild, inject, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { MobileUxService } from '../../../core/services/mobile-ux.service';
import { UiPreferencesService } from '../../service/ui-preferences.service';
import { addFullscreenChangeListener } from '../../util/fullscreen.util';

@Component({
  selector: 'app-cover-preview',
  standalone: true,
  imports: [],
  template: `
    <div class="cover-preview-panel" #panel [class.cover-preview-panel--thumb-handles]="thumbHandles">
      <div class="cover-preview-resize-handle" #resizeHandle
           [class.cover-preview-resize-handle--visible]="thumbHandles"
           [attr.aria-label]="'Resize cover preview'"></div>
      <div class="cover-preview-header">
        <span class="cover-preview-label">Cover Preview</span>
        @if (bookTitle) {
          <span class="cover-preview-title" [title]="bookTitle">{{ bookTitle }}</span>
        }
      </div>
      <div class="cover-preview-body">
        @if (coverUrl && !imageError) {
          <img
            [src]="coverUrl"
            [alt]="bookTitle"
            class="cover-img"
            (error)="onImgError()"
          />
        } @else {
          <div class="cover-placeholder">
            <i class="pi pi-book"></i>
            <span>Hover over a book to preview</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    '.cover-preview-panel { display: flex; flex-direction: column; border-top: 1px solid var(--p-content-border-color); background: var(--card-background); height: 300px; min-height: 120px; max-height: 900px; position: relative; }',
    // Match side-panel handles: transparent hit target + small grip only (no border overlay).
    '.cover-preview-resize-handle { position: absolute; top: -6px; left: 0; right: 0; height: 12px; cursor: row-resize; z-index: 10; background: transparent; touch-action: none; }',
    '.cover-preview-resize-handle::after { content: ""; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 36px; height: 4px; border-radius: 999px; background: transparent; pointer-events: none; }',
    '.cover-preview-resize-handle:hover::after, .cover-preview-resize-handle:active::after { background: color-mix(in srgb, var(--primary-color) 55%, transparent); }',
    '.cover-preview-resize-handle--visible { left: auto; right: 0; width: 72px; height: 28px; top: -11px; background: transparent; }',
    '.cover-preview-resize-handle--visible::after { left: auto; right: 14px; transform: translateY(-50%); width: 40px; height: 5px; background: color-mix(in srgb, var(--primary-color) 70%, white 30%); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent), 0 2px 6px rgba(0, 0, 0, 0.25); }',
    ':host { display: block; flex-shrink: 0; }',
    '.cover-preview-header { display: flex; flex-direction: column; padding: 5px 10px 4px; gap: 2px; border-bottom: 1px solid var(--p-content-border-color); flex-shrink: 0; }',
    '.cover-preview-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-color-secondary); }',
    '.cover-preview-title { font-size: 0.75rem; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.cover-preview-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: hidden; min-height: 0; }',
    '.cover-img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: block; pointer-events: none; }',
    '.cover-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-color-secondary); text-align: center; }',
    '.cover-placeholder i { font-size: 2.5rem; opacity: 0.3; }',
    '.cover-placeholder span { font-size: 0.78rem; opacity: 0.5; }'
  ]
})
export class CoverPreviewComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() coverUrl: string | null = null;
  @Input() bookTitle = '';

  @ViewChild('panel') panelRef!: ElementRef<HTMLElement>;
  @ViewChild('resizeHandle') resizeHandleRef!: ElementRef<HTMLElement>;

  imageError = false;
  thumbHandles = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['coverUrl']) {
      this.imageError = false;
    }
  }

  private dragging = false;
  private activePointerId: number | null = null;
  private startY = 0;
  private startHeight = 0;
  private unlisten: (() => void)[] = [];
  private prefsSub: Subscription | null = null;
  private readonly STORAGE_KEY = 'bl-cover-preview-height';

  private renderer = inject(Renderer2);
  private uiPrefs = inject(UiPreferencesService);
  private mobileUx = inject(MobileUxService);

  constructor() {
    this.thumbHandles = this.computeThumbHandles();
  }

  ngAfterViewInit(): void {
    const panel = this.panelRef.nativeElement;
    const handle = this.resizeHandleRef.nativeElement;

    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      const h = parseInt(saved, 10);
      if (!isNaN(h)) this.renderer.setStyle(panel, 'height', h + 'px');
    }

    this.prefsSub = this.uiPrefs.showResizeHandles$.subscribe(() => {
      this.thumbHandles = this.computeThumbHandles();
    });

    const onPointerDown = (e: PointerEvent) => {
      this.dragging = true;
      this.activePointerId = e.pointerId;
      this.startY = e.clientY;
      this.startHeight = panel.offsetHeight;
      this.renderer.addClass(document.body, 'bl-resizing-vertical');
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragging || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) {
        return;
      }
      const delta = this.startY - e.clientY;
      const newHeight = Math.min(900, Math.max(120, this.startHeight + delta));
      this.renderer.setStyle(panel, 'height', newHeight + 'px');
      localStorage.setItem(this.STORAGE_KEY, String(newHeight));
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
          handle.releasePointerCapture?.(pointerId);
        } catch {
          // Capture may already be gone after fullscreen / lostpointercapture.
        }
      }
      this.activePointerId = null;
      this.renderer.removeClass(document.body, 'bl-resizing-vertical');
    };

    this.unlisten.push(
      this.renderer.listen(handle, 'pointerdown', onPointerDown),
      this.renderer.listen(handle, 'lostpointercapture', () => endDrag()),
      this.renderer.listen(document, 'pointermove', onPointerMove),
      this.renderer.listen(document, 'pointerup', endDrag),
      this.renderer.listen(document, 'pointercancel', endDrag),
      addFullscreenChangeListener(() => endDrag()),
    );
  }

  private computeThumbHandles(): boolean {
    return this.uiPrefs.showResizeHandles
      || this.mobileUx.hasTouchInput
      || this.mobileUx.isMobileOrTablet;
  }

  onImgError(): void {
    this.imageError = true;
  }

  ngOnDestroy(): void {
    if (this.dragging) {
      this.dragging = false;
      this.activePointerId = null;
      this.renderer.removeClass(document.body, 'bl-resizing-vertical');
    }
    this.prefsSub?.unsubscribe();
    this.unlisten.forEach(fn => fn());
  }
}
