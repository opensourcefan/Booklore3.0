import {Injectable, OnDestroy, inject} from '@angular/core';
import {Router} from '@angular/router';
import {MobileUxService} from '../../core/services/mobile-ux.service';

export interface MobileBackHandle {
  release: (removeHistoryEntry?: boolean) => void;
}

interface MobileBackEntry {
  token: number;
  close: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class MobileBackNavigationService implements OnDestroy {
  private readonly STATE_KEY = 'fableMobileBackToken';

  private readonly router = inject(Router);
  private readonly mobileUx = inject(MobileUxService);

  private nextToken = 0;
  private stack: MobileBackEntry[] = [];
  private ignoreNextPopstateCount = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.onPopState);
    }
  }

  register(close: () => void): MobileBackHandle {
    if (typeof window === 'undefined' || !this.isMobileInteractionMode()) {
      return {
        release: () => undefined,
      };
    }

    const token = ++this.nextToken;
    this.stack.push({token, close});

    window.history.pushState(
      {...window.history.state, [this.STATE_KEY]: token},
      '',
      this.router.url
    );

    let released = false;

    return {
      release: (removeHistoryEntry = true) => {
        if (released) {
          return;
        }

        released = true;
        this.releaseEntry(token, removeHistoryEntry);
      },
    };
  }

  /** True when at least one overlay/dialog back token is registered. */
  get hasOverlayEntry(): boolean {
    return this.stack.length > 0;
  }

  /**
   * Invoke the same history.back() path used by OS / edge-swipe back.
   * When an overlay token exists, popstate closes it; otherwise route history pops.
   */
  requestBack(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    window.history.back();
    return true;
  }

  private releaseEntry(token: number, removeHistoryEntry: boolean): void {
    const index = this.stack.findIndex(entry => entry.token === token);
    if (index === -1) {
      return;
    }

    const isTopEntry = index === this.stack.length - 1;
    this.stack.splice(index, 1);

    if (!removeHistoryEntry || !isTopEntry || typeof window === 'undefined') {
      return;
    }

    this.ignoreNextPopstateCount += 1;
    window.history.back();
  }

  private onPopState = (): void => {
    if (this.ignoreNextPopstateCount > 0) {
      this.ignoreNextPopstateCount -= 1;
      return;
    }

    const entry = this.stack.pop();
    if (!entry) {
      return;
    }

    entry.close();
  };

  private isMobileInteractionMode(): boolean {
    return this.mobileUx.isMobileInteractionMode;
  }
}
