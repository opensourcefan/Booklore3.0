import {Injectable} from '@angular/core';

@Injectable({providedIn: 'root'})
export class FaviconService {
  private svgTemplate = (color: string) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <path d="M13 9H28C28 9 29 9 29 10V30C29 30 29 31 28 31H4C4 31 3 31 3 30V5M3 5C3 1 7 1 7 1H29M3 5C3 9 7 9 7 9M7 5V17L10 15L13 17V5H27" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  updateFavicon(color: string) {
    const svg = this.svgTemplate(color);
    const blob = new Blob([svg], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);

    let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    favicon.type = 'image/svg+xml';
    favicon.href = url;
  }
}
