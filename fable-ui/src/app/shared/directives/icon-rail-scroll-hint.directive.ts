import {
  AfterViewInit,
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  inject
} from '@angular/core';

/**
 * Marks a horizontal icon/action rail with can-scroll start/end classes so CSS
 * can show edge fades / chevrons only when overflow exists in that direction.
 *
 * Usage: put on the element that has overflow-x: auto (typically with icon-rail).
 */
@Directive({
  selector: '[appIconRailHint]',
  standalone: true,
  host: {
    class: 'icon-rail-hint'
  }
})
export class IconRailScrollHintDirective implements AfterViewInit, OnDestroy {
  private static readonly START_CLASS = 'icon-rail--can-scroll-start';
  private static readonly END_CLASS = 'icon-rail--can-scroll-end';
  private static readonly EPSILON = 2;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly ngZone = inject(NgZone);

  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private removeScrollListener: (() => void) | null = null;
  private rafId = 0;

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      const onScroll = (): void => this.scheduleUpdate();
      host.addEventListener('scroll', onScroll, {passive: true});
      this.removeScrollListener = () => host.removeEventListener('scroll', onScroll);

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
        this.resizeObserver.observe(host);
      }

      if (typeof MutationObserver !== 'undefined') {
        this.mutationObserver = new MutationObserver(() => this.scheduleUpdate());
        this.mutationObserver.observe(host, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'disabled']
        });
        // Selection panels toggle visibility on a parent; re-measure when that flips.
        if (host.parentElement) {
          this.mutationObserver.observe(host.parentElement, {
            attributes: true,
            attributeFilter: ['class', 'style']
          });
        }
      }

      this.scheduleUpdate();
      // Panel open / font / button layout often settles after first paint.
      requestAnimationFrame(() => this.scheduleUpdate());
      setTimeout(() => this.scheduleUpdate(), 120);
    });
  }

  ngOnDestroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.removeScrollListener?.();
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  private scheduleUpdate(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.updateHints();
    });
  }

  private updateHints(): void {
    const host = this.el.nativeElement;
    const maxScroll = host.scrollWidth - host.clientWidth;
    const canScroll = maxScroll > IconRailScrollHintDirective.EPSILON;
    const canScrollStart = canScroll && host.scrollLeft > IconRailScrollHintDirective.EPSILON;
    const canScrollEnd =
      canScroll && host.scrollLeft < maxScroll - IconRailScrollHintDirective.EPSILON;

    host.classList.toggle(IconRailScrollHintDirective.START_CLASS, canScrollStart);
    host.classList.toggle(IconRailScrollHintDirective.END_CLASS, canScrollEnd);
  }
}
