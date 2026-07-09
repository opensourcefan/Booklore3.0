import { Directive, ElementRef, OnInit, Renderer2, inject } from '@angular/core';

@Directive({
  selector: '[appTouchTarget]',
  standalone: true
})
export class TouchTargetDirective implements OnInit {
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);

  ngOnInit(): void {
    const element = this.el.nativeElement;
    this.renderer.setStyle(element, 'min-width', '40px');
    this.renderer.setStyle(element, 'min-height', '40px');
    this.renderer.setStyle(element, 'display', 'inline-flex');
    this.renderer.setStyle(element, 'align-items', 'center');
    this.renderer.setStyle(element, 'justify-content', 'center');
  }
}
