import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { clamp } from '../../../core/utils/math.utils';

const DEFAULT_CAP = 500;
const MIN_CAP = 1;
const MAX_CAP = 1000;
const STORAGE_KEY = 'bl-magic-shelf-cap';

@Injectable({ providedIn: 'root' })
export class MagicShelfCapService {
  private readonly _cap$ = new BehaviorSubject<number>(this.loadCap());
  readonly cap$: Observable<number> = this._cap$.asObservable();

  getCap(): number {
    return this._cap$.value;
  }

  setCap(value: number): void {
    const clamped = clamp(MAX_CAP, MIN_CAP, Math.round(value));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    this._cap$.next(clamped);
  }

  private loadCap(): number {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_CAP && parsed <= MAX_CAP) {
          return parsed;
        }
      }
    } catch {
      // localStorage unavailable (e.g. SSR), use default
    }
    return DEFAULT_CAP;
  }
}
