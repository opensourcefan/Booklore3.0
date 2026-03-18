import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly COVER_PREVIEW_KEY = 'bl-show-cover-preview';
  private _showCoverPreview$ = new BehaviorSubject<boolean>(
    localStorage.getItem(this.COVER_PREVIEW_KEY) !== 'false'
  );
  readonly showCoverPreview$ = this._showCoverPreview$.asObservable();
  get showCoverPreview(): boolean { return this._showCoverPreview$.value; }
  setShowCoverPreview(value: boolean): void {
    localStorage.setItem(this.COVER_PREVIEW_KEY, String(value));
    this._showCoverPreview$.next(value);
  }
}
