import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeLoaders: HTMLElement[] = [];

  show(message: string = 'Loading...'): HTMLElement {
    const loader = document.createElement('div');
    loader.className = 'fullscreen-loader';

    // Build the loader DOM structure without innerHTML to avoid XSS (OWASP A03).
    // The message is inserted via textContent so no HTML escaping is required and
    // no user-controlled or server-sourced content can be interpreted as markup.
    const icon = document.createElement('i');
    icon.className = 'pi pi-spin pi-spinner';
    icon.style.cssText = 'font-size: 3rem; color: var(--primary-color);';

    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin-top: 1rem; color: var(--text-color);';
    msgEl.textContent = message;

    const content = document.createElement('div');
    content.className = 'loader-content';
    content.appendChild(icon);
    content.appendChild(msgEl);
    content.style.cssText = `
      text-align: center;
      background: var(--surface-card);
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    loader.appendChild(content);

    loader.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
    `;

    document.body.appendChild(loader);
    document.body.style.cursor = 'wait';
    this.activeLoaders.push(loader);

    return loader;
  }

  hide(loader: HTMLElement): void {
    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);

      const index = this.activeLoaders.indexOf(loader);
      if (index > -1) {
        this.activeLoaders.splice(index, 1);
      }

      if (this.activeLoaders.length === 0) {
        document.body.style.cursor = 'default';
      }
    }
  }

  hideAll(): void {
    this.activeLoaders.forEach(loader => {
      if (loader && loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    });
    this.activeLoaders = [];
    document.body.style.cursor = 'default';
  }
}

