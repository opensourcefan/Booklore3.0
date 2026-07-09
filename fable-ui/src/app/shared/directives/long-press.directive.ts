import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';

@Directive({
  selector: '[appLongPress]',
  standalone: true
})
export class LongPressDirective implements OnInit, OnDestroy {
  @Input() duration = 500; // ms
  @Output() appLongPress = new EventEmitter<TouchEvent | MouseEvent>();

  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isPressing = false;
  private el = inject(ElementRef);

  ngOnInit(): void {
    const element = this.el.nativeElement;
    element.addEventListener('touchstart', this.onPressStart, { passive: true });
    element.addEventListener('touchend', this.onPressEnd, { passive: true });
    element.addEventListener('touchcancel', this.onPressEnd, { passive: true });
    element.addEventListener('mousedown', this.onPressStart);
    element.addEventListener('mouseup', this.onPressEnd);
    element.addEventListener('mouseleave', this.onPressEnd);
  }

  ngOnDestroy(): void {
    const element = this.el.nativeElement;
    element.removeEventListener('touchstart', this.onPressStart);
    element.removeEventListener('touchend', this.onPressEnd);
    element.removeEventListener('touchcancel', this.onPressEnd);
    element.removeEventListener('mousedown', this.onPressStart);
    element.removeEventListener('mouseup', this.onPressEnd);
    element.removeEventListener('mouseleave', this.onPressEnd);
    this.clearTimeout();
  }

  private onPressStart = (event: TouchEvent | MouseEvent): void => {
    this.isPressing = true;
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      if (this.isPressing) {
        this.appLongPress.emit(event);
      }
    }, this.duration);
  };

  private onPressEnd = (): void => {
    this.isPressing = false;
    this.clearTimeout();
  };

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
