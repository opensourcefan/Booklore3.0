import {Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {IconRailScrollHintDirective} from './icon-rail-scroll-hint.directive';

@Component({
  standalone: true,
  imports: [IconRailScrollHintDirective],
  template: `
    <div class="rail" appIconRailHint>
      <span>content</span>
    </div>
  `
})
class HostRailComponent {}

describe('IconRailScrollHintDirective', () => {
  function stubScrollMetrics(
    el: HTMLElement,
    metrics: {scrollWidth: number; clientWidth: number; scrollLeft?: number}
  ): void {
    Object.defineProperty(el, 'scrollWidth', {configurable: true, get: () => metrics.scrollWidth});
    Object.defineProperty(el, 'clientWidth', {configurable: true, get: () => metrics.clientWidth});
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      get: () => metrics.scrollLeft ?? 0,
      set: (value: number) => {
        metrics.scrollLeft = value;
      }
    });
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 130));
    fixture.detectChanges();
  }

  it('adds end hint when content overflows and start is at scrollLeft 0', async () => {
    await TestBed.configureTestingModule({
      imports: [HostRailComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(HostRailComponent);
    const rail = fixture.nativeElement.querySelector('.rail') as HTMLElement;
    const metrics = {scrollWidth: 240, clientWidth: 80, scrollLeft: 0};
    stubScrollMetrics(rail, metrics);
    await settle(fixture);

    expect(rail.classList.contains('icon-rail-hint')).toBe(true);
    expect(rail.classList.contains('icon-rail--can-scroll-end')).toBe(true);
    expect(rail.classList.contains('icon-rail--can-scroll-start')).toBe(false);

    metrics.scrollLeft = 160;
    rail.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(rail.classList.contains('icon-rail--can-scroll-start')).toBe(true);
    expect(rail.classList.contains('icon-rail--can-scroll-end')).toBe(false);
  });

  it('adds no scroll hints when content fits', async () => {
    await TestBed.configureTestingModule({
      imports: [HostRailComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(HostRailComponent);
    const rail = fixture.nativeElement.querySelector('.rail') as HTMLElement;
    stubScrollMetrics(rail, {scrollWidth: 80, clientWidth: 80, scrollLeft: 0});
    await settle(fixture);

    expect(rail.classList.contains('icon-rail--can-scroll-end')).toBe(false);
    expect(rail.classList.contains('icon-rail--can-scroll-start')).toBe(false);
  });
});
