import {Injectable, OnDestroy, inject} from '@angular/core';
import {Router} from '@angular/router';

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
  private readonly MOBILE_BREAKPOINT = 768;
  private readonly MOBILE_LONG_EDGE_MAX_PX = 1200;
  private readonly STATE_KEY = 'bookloreMobileBackToken';

  private readonly router = inject(Router);

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
    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
    const longEdge = Math.max(window.innerWidth, window.innerHeight);
    return shortEdge < this.MOBILE_BREAKPOINT && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
  }
}
