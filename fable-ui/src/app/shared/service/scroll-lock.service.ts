import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ScrollLockService {
  private lockCount = 0;
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  lock(): void {
    if (!this.isBrowser) return;
    this.lockCount++;
    if (this.lockCount === 1) {
      document.body.style.overflow = 'hidden';
    }
  }

  unlock(): void {
    if (!this.isBrowser) return;
    if (this.lockCount > 0) {
      this.lockCount--;
      if (this.lockCount === 0) {
        document.body.style.overflow = '';
      }
    }
  }
}
