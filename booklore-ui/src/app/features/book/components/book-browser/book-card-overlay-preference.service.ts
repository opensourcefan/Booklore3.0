import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Subject} from 'rxjs';
import {debounceTime, filter, takeUntil} from 'rxjs/operators';
import {UserService} from '../../../settings/user-management/user.service';

@Injectable({
  providedIn: 'root'
})
export class BookCardOverlayPreferenceService {
  private readonly userService = inject(UserService);

  private readonly _showBookTypePill = new BehaviorSubject<boolean>(true);
  private readonly _showAiPanelData = new BehaviorSubject<boolean>(true);
  private readonly _showIssueNumber = new BehaviorSubject<boolean>(true);
  readonly showBookTypePill$ = this._showBookTypePill.asObservable();
  readonly showAiPanelData$ = this._showAiPanelData.asObservable();
  readonly showIssueNumber$ = this._showIssueNumber.asObservable();

  private destroy$ = new Subject<void>();
  private savePreferences$ = new Subject<void>();
  private hasUserToggled = false;
  private currentContext: { type: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF', id: number } | null = null;

  constructor() {
    this.userService.userState$
      .pipe(
        filter(userState => !!userState?.user && userState.loaded),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.loadPreferencesFromUser();
      });

    this.savePreferences$
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.hasUserToggled) {
          this.persistPreferences();
        }
      });
  }

  setContext(type: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF' | null, id: number | null): void {
    if (type && id) {
      this.currentContext = {type, id};
    } else {
      this.currentContext = null;
    }
    this.loadPreferencesFromUser();
  }

  setShowBookTypePill(show: boolean): void {
    this.hasUserToggled = true;
    this._showBookTypePill.next(show);
    this.savePreferences$.next();
  }

  setShowAiPanelData(show: boolean): void {
    this.hasUserToggled = true;
    this._showAiPanelData.next(show);
    this.savePreferences$.next();
  }

  setShowIssueNumber(show: boolean): void {
    this.hasUserToggled = true;
    this._showIssueNumber.next(show);
    this.savePreferences$.next();
  }

  get showBookTypePill(): boolean {
    return this._showBookTypePill.value;
  }

  get showAiPanelData(): boolean {
    return this._showAiPanelData.value;
  }

  get showIssueNumber(): boolean {
    return this._showIssueNumber.value;
  }

  private loadPreferencesFromUser(): void {
    const user = this.userService.getCurrentUser();
    const prefs = user?.userSettings?.entityViewPreferences;

    let showBookType = true;
    let showAiPanelData = true;
    let showIssueNumber = true;
    if (prefs) {
      const globalAny = prefs.global as any;
      showBookType = prefs.global?.overlayBookType ?? globalAny?.showBookTypePill ?? true;
      showAiPanelData = prefs.global?.overlayAiPanelData ?? true;
      showIssueNumber = prefs.global?.overlayIssueNumber ?? true;

      if (this.currentContext) {
        const override = prefs.overrides?.find(o =>
          o.entityType === this.currentContext?.type && o.entityId === this.currentContext?.id
        );
        if (override) {
          const prefAny = override.preferences as any;
          if (override.preferences.overlayBookType !== undefined) {
            showBookType = override.preferences.overlayBookType;
          } else if (prefAny?.showBookTypePill !== undefined) {
            showBookType = prefAny.showBookTypePill;
          }
          if (override.preferences.overlayAiPanelData !== undefined) {
            showAiPanelData = override.preferences.overlayAiPanelData;
          }
          if (override.preferences.overlayIssueNumber !== undefined) {
            showIssueNumber = override.preferences.overlayIssueNumber;
          }
        }
      }
    }

    this.hasUserToggled = false;
    if (this._showBookTypePill.value !== showBookType) this._showBookTypePill.next(showBookType);
    if (this._showAiPanelData.value !== showAiPanelData) this._showAiPanelData.next(showAiPanelData);
    if (this._showIssueNumber.value !== showIssueNumber) this._showIssueNumber.next(showIssueNumber);
  }

  private persistPreferences(): void {
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const showBookType = this._showBookTypePill.value;
    const showAiPanelData = this._showAiPanelData.value;
    const showIssueNumber = this._showIssueNumber.value;

    const prefs = structuredClone(user.userSettings.entityViewPreferences ?? {
      global: {
        sortKey: 'addedOn',
        sortDir: 'DESC',
        view: 'GRID',
        coverSize: 1.0,
        seriesCollapsed: false,
        overlayBookType: true,
        overlayAiPanelData: true,
        overlayIssueNumber: true
      },
      overrides: []
    });

    if (!prefs.overrides) {
      prefs.overrides = [];
    }

    if (this.currentContext) {
      let override = prefs.overrides.find(o =>
        o.entityType === this.currentContext?.type && o.entityId === this.currentContext?.id
      );

      if (!override) {
        override = {
          entityType: this.currentContext.type,
          entityId: this.currentContext.id,
          preferences: {
            ...prefs.global,
            overlayBookType: showBookType,
            overlayAiPanelData: showAiPanelData,
            overlayIssueNumber: showIssueNumber
          }
        };
        prefs.overrides.push(override);
      } else {
        override.preferences.overlayBookType = showBookType;
        override.preferences.overlayAiPanelData = showAiPanelData;
        override.preferences.overlayIssueNumber = showIssueNumber;
      }
    } else {
      prefs.global.overlayBookType = showBookType;
      prefs.global.overlayAiPanelData = showAiPanelData;
      prefs.global.overlayIssueNumber = showIssueNumber;
    }

    this.userService.updateUserSetting(user.id, 'entityViewPreferences', prefs);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
