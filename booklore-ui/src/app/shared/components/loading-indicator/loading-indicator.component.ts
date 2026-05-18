import {Component, Input} from '@angular/core';

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  template: `
    <picture class="loading-indicator">
      <source srcset="assets/images/loaders/loading3-transparent.webp" type="image/webp">
      <img
        src="assets/images/loaders/loading3-transparent.gif"
        [attr.alt]="decorative ? '' : alt"
        decoding="async"
        loading="eager">
    </picture>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
    }

    .loading-indicator,
    .loading-indicator img {
      display: block;
      width: 100%;
      height: 100%;
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