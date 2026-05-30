import {Component, Input} from '@angular/core';

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  template: `
    <img
      class="loading-indicator"
      src="assets/images/loaders/loading3-transparent.webp"
      [attr.alt]="decorative ? '' : alt"
      decoding="async">
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
    }

    .loading-indicator {
      display: block;
      width: 100%;
      height: 100%;
      opacity: 0;
      animation: bl-loader-reveal 0s step-end var(--bl-loader-delay, 200ms) forwards;
    }
  `],
  host: {
    '[style.width.px]': 'width',
    '[style.height.px]': 'height',
    '[attr.aria-hidden]': 'decorative ? "true" : null',
  }
})
export class LoadingIndicatorComponent {
  @Input() alt = 'Loading';
  @Input() width = 62;
  @Input() height = 48;
  @Input() decorative = false;
}