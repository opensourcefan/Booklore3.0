import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';

@Directive({
  selector: '[appTouchSwipe]',
  standalone: true
})
export class TouchSwipeDirective implements OnInit, OnDestroy {
  @Output() swipeLeft = new EventEmitter<TouchEvent>();
  @Output() swipeRight = new EventEmitter<TouchEvent>();
  @Output() swipeUp = new EventEmitter<TouchEvent>();
  @Output() swipeDown = new EventEmitter<TouchEvent>();

  private startX = 0;
  private startY = 0;
  private minSwipeDistance = 50; // pixels
  private el = inject(ElementRef);

  ngOnInit(): void {
    const element = this.el.nativeElement;
    element.addEventListener('touchstart', this.onTouchStart, { passive: true });
    element.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    const element = this.el.nativeElement;
    element.removeEventListener('touchstart', this.onTouchStart);
    element.removeEventListener('touchend', this.onTouchEnd);
  }

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches && event.touches.length > 0) {
      this.startX = event.touches[0].clientX;
      this.startY = event.touches[0].clientY;
    }
  };

  private onTouchEnd = (event: TouchEvent): void => {
    if (event.changedTouches && event.changedTouches.length > 0) {
      const diffX = event.changedTouches[0].clientX - this.startX;
      const diffY = event.changedTouches[0].clientY - this.startY;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > this.minSwipeDistance) {
          if (diffX > 0) {
            this.swipeRight.emit(event);
          } else {
            this.swipeLeft.emit(event);
          }
        }
      } else {
        if (Math.abs(diffY) > this.minSwipeDistance) {
          if (diffY > 0) {
            this.swipeDown.emit(event);
          } else {
            this.swipeUp.emit(event);
          }
        }
      }
    }
  };
}
