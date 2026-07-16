import {inject, Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {filter} from 'rxjs/operators';
import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {MediaTypeSettings, UserService} from '../../settings/user-management/user.service';

export interface ResolvedMediaTypeSettings {
  customTypes: string[];
  recentTypes: string[];
  sidebarOrder: string[];
}

@Injectable({providedIn: 'root'})
export class MediaTypePreferencesService {
  private static readonly reservedTypes = new Set(['PHYSICAL']);
  private readonly customMediaTypesKey = 'customMediaTypes';
  private readonly legacyBookTypesKey = 'customBookTypes';
  private readonly recentMediaTypesKey = 'FABLE_RECENT_MEDIA_TYPES';
  /** Device-browser-local sidebar row order for media types (not synced to the account). */
  private readonly sidebarBookTypeOrderKey = 'sidebarBookTypeOrder';
  private readonly maxRecent = 5;

  private readonly localStorageService = inject(LocalStorageService);
  private readonly userService = inject(UserService);

  private readonly settingsSubject = new BehaviorSubject<ResolvedMediaTypeSettings>(this.readInitialSettings());
  readonly settings$ = this.settingsSubject.asObservable();

  constructor() {
    this.userService.userState$.pipe(
      filter(state => !!state?.user && state.loaded)
    ).subscribe(state => {
      this.initializeForUser(state.user!.id, state.user!.userSettings.mediaTypeSettings);
    });
  }

  get settings(): ResolvedMediaTypeSettings {
    return this.settingsSubject.value;
  }

  getCustomTypes(): string[] {
    return [...this.settings.customTypes];
  }

  getRecentTypes(): string[] {
    return [...this.settings.recentTypes];
  }

  getSidebarOrder(): string[] {
    return [...this.settings.sidebarOrder];
  }

  setCustomTypes(types: string[]): void {
    this.persistAccountSettings({customTypes: this.mergeTypes(types)});
  }

  rememberRecentType(type: string): void {
    const normalized = type.trim();
    if (!normalized) {
      return;
    }

    const merged = [normalized, ...this.settings.recentTypes.filter(item => item.toLowerCase() !== normalized.toLowerCase())]
      .slice(0, this.maxRecent);

    this.persistAccountSettings({recentTypes: merged});
  }

  /**
   * Persist media-type sidebar row order on this device/browser only.
   * Returns false when localStorage cannot save (private mode / quota).
   */
  setSidebarOrder(order: string[]): boolean {
    const normalizedOrder = this.normalizeStringList(order);
    const saved = this.localStorageService.trySet(this.sidebarBookTypeOrderKey, normalizedOrder);
    this.settingsSubject.next({
      ...this.settings,
      sidebarOrder: normalizedOrder,
    });
    return saved;
  }

  private initializeForUser(userId: number, persisted: MediaTypeSettings | undefined): void {
    const normalizedPersisted = this.normalizeAccountSettings(persisted);
    const legacy = this.readLegacyAccountSettings();
    const hasLegacyAccount = legacy.customTypes.length > 0 || legacy.recentTypes.length > 0;

    let customTypes = normalizedPersisted.customTypes;
    let recentTypes = normalizedPersisted.recentTypes;

    if (!persisted && hasLegacyAccount) {
      customTypes = this.mergeTypes([...normalizedPersisted.customTypes, ...legacy.customTypes]);
      recentTypes = this.mergeRecent([...legacy.recentTypes, ...normalizedPersisted.recentTypes]);
      this.userService.updateUserSetting(userId, 'mediaTypeSettings', {
        customTypes,
        recentTypes,
        // Sidebar row order is device-local; do not push it to the account.
        sidebarOrder: [],
      });
    }

    this.clearLegacyAccountKeys();

    const sidebarOrder = this.resolveDeviceSidebarOrder(persisted?.sidebarOrder, legacy.sidebarOrder);

    this.settingsSubject.next({
      customTypes,
      recentTypes,
      sidebarOrder,
    });
  }

  private persistAccountSettings(partial: Partial<Pick<ResolvedMediaTypeSettings, 'customTypes' | 'recentTypes'>>): void {
    const next: ResolvedMediaTypeSettings = {
      customTypes: partial.customTypes !== undefined ? this.mergeTypes(partial.customTypes) : this.settings.customTypes,
      recentTypes: partial.recentTypes !== undefined ? this.mergeRecent(partial.recentTypes) : this.settings.recentTypes,
      sidebarOrder: this.readDeviceSidebarOrder(),
    };
    this.settingsSubject.next(next);
    this.clearLegacyAccountKeys();

    const userId = this.userService.getCurrentUser()?.id;
    if (userId != null) {
      this.userService.updateUserSetting(userId, 'mediaTypeSettings', {
        customTypes: next.customTypes,
        recentTypes: next.recentTypes,
        // Do not overwrite server sidebarOrder with device-local order; leave empty / prior semantics alone.
        sidebarOrder: [],
      });
    }
  }

  private resolveDeviceSidebarOrder(persistedOrder: string[] | undefined, legacyOrder: string[]): string[] {
    const existingLocal = this.localStorageService.get<string[]>(this.sidebarBookTypeOrderKey);
    if (existingLocal?.length) {
      return this.normalizeStringList(existingLocal);
    }

    const seed = this.normalizeStringList(
      (persistedOrder?.length ? persistedOrder : null)
      ?? (legacyOrder.length ? legacyOrder : null)
      ?? []
    );

    if (seed.length) {
      this.localStorageService.trySet(this.sidebarBookTypeOrderKey, seed);
    }

    return seed;
  }

  private readDeviceSidebarOrder(): string[] {
    return this.normalizeStringList(this.localStorageService.get<string[]>(this.sidebarBookTypeOrderKey) ?? []);
  }

  private readInitialSettings(): ResolvedMediaTypeSettings {
    const legacy = this.readLegacyAccountSettings();
    return {
      customTypes: legacy.customTypes,
      recentTypes: legacy.recentTypes,
      sidebarOrder: this.resolveDeviceSidebarOrder(undefined, legacy.sidebarOrder),
    };
  }

  private normalizeAccountSettings(settings: MediaTypeSettings | undefined): Pick<ResolvedMediaTypeSettings, 'customTypes' | 'recentTypes'> {
    return {
      customTypes: this.mergeTypes(settings?.customTypes ?? []),
      recentTypes: this.mergeRecent(settings?.recentTypes ?? []),
    };
  }

  private mergeTypes(types: string[]): string[] {
    return this.normalizeStringList(types).sort((a, b) => a.localeCompare(b));
  }

  private mergeRecent(types: string[]): string[] {
    return this.normalizeStringList(types).slice(0, this.maxRecent);
  }

  private normalizeStringList(values: string[]): string[] {
    const normalized: string[] = [];
    for (const rawValue of values) {
      const value = rawValue.trim();
      if (!value || MediaTypePreferencesService.reservedTypes.has(value.toUpperCase())) {
        continue;
      }
      if (!normalized.some(existing => existing.toLowerCase() === value.toLowerCase())) {
        normalized.push(value);
      }
    }
    return normalized;
  }

  private readLegacyAccountSettings(): ResolvedMediaTypeSettings {
    return {
      customTypes: this.mergeTypes([
        ...(this.localStorageService.get<string[]>(this.customMediaTypesKey) ?? []),
        ...(this.localStorageService.get<string[]>(this.legacyBookTypesKey) ?? []),
      ]),
      recentTypes: this.mergeRecent(this.localStorageService.get<string[]>(this.recentMediaTypesKey) ?? []),
      sidebarOrder: this.normalizeStringList(this.localStorageService.get<string[]>(this.sidebarBookTypeOrderKey) ?? []),
    };
  }

  private clearLegacyAccountKeys(): void {
    this.localStorageService.remove(this.customMediaTypesKey);
    this.localStorageService.remove(this.legacyBookTypesKey);
    this.localStorageService.remove(this.recentMediaTypesKey);
    // Intentionally keep sidebarBookTypeOrder — it is the live device-local order key.
  }
}
