import { AfterViewInit, Component, ElementRef, Input, OnDestroy, Renderer2, ViewChild, inject, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-cover-preview',
  standalone: true,
  imports: [],
  template: `
    <div class="cover-preview-panel" #panel>
      <div class="cover-preview-resize-handle" #resizeHandle></div>
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
    '.cover-preview-resize-handle { position: absolute; top: -4px; left: 0; right: 0; height: 8px; cursor: row-resize; z-index: 10; background: transparent; transition: background 0.15s ease; }',
    '.cover-preview-resize-handle:hover, .cover-preview-resize-handle:active { background: var(--p-primary-color, #818cf8); opacity: 0.45; border-radius: 3px; }',
    ':host { display: block; flex-shrink: 0; }',
    '.cover-preview-header { display: flex; flex-direction: column; padding: 5px 10px 4px; gap: 2px; border-bottom: 1px solid var(--p-content-border-color); flex-shrink: 0; }',
    '.cover-preview-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-color-secondary); }',
    '.cover-preview-title { font-size: 0.75rem; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.cover-preview-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: hidden; min-height: 0; }',
    '.cover-img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: block; }',
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['coverUrl']) {
      this.imageError = false;
    }
  }

  private dragging = false;
  private startY = 0;
  private startHeight = 0;
  private unlisten: (() => void)[] = [];
  private readonly STORAGE_KEY = 'bl-cover-preview-height';

  private renderer = inject(Renderer2);

  ngAfterViewInit(): void {
    const panel = this.panelRef.nativeElement;
    const handle = this.resizeHandleRef.nativeElement;

    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      const h = parseInt(saved, 10);
      if (!isNaN(h)) this.renderer.setStyle(panel, 'height', h + 'px');
    }

    const onMouseDown = (e: MouseEvent) => {
      this.dragging = true;
      this.startY = e.clientY;
      this.startHeight = panel.offsetHeight;
      this.renderer.addClass(document.body, 'bl-resizing-vertical');
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      const delta = this.startY - e.clientY;
      const newHeight = Math.min(900, Math.max(120, this.startHeight + delta));
      this.renderer.setStyle(panel, 'height', newHeight + 'px');
      localStorage.setItem(this.STORAGE_KEY, String(newHeight));
    };

    const onMouseUp = () => {
      if (this.dragging) {
        this.dragging = false;
        this.renderer.removeClass(document.body, 'bl-resizing-vertical');
      }
    };

    this.unlisten.push(
      this.renderer.listen(handle, 'mousedown', onMouseDown),
      this.renderer.listen(document, 'mousemove', onMouseMove),
      this.renderer.listen(document, 'mouseup', onMouseUp),
    );
  }

  onImgError(): void {
    this.imageError = true;
  }

  ngOnDestroy(): void {
    this.unlisten.forEach(fn => fn());
  }
}
