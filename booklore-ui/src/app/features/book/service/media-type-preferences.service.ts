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
  private readonly recentMediaTypesKey = 'BOOKLORE_RECENT_MEDIA_TYPES';
  private readonly sidebarBookTypeOrderKey = 'sidebarBookTypeOrder';
  private readonly maxRecent = 5;

  private readonly localStorageService = inject(LocalStorageService);
  private readonly userService = inject(UserService);

  private readonly settingsSubject = new BehaviorSubject<ResolvedMediaTypeSettings>(this.readLegacySettings());
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
    this.persistSettings({customTypes: this.mergeTypes(types)});
  }

  rememberRecentType(type: string): void {
    const normalized = type.trim();
    if (!normalized) {
      return;
    }

    const merged = [normalized, ...this.settings.recentTypes.filter(item => item.toLowerCase() !== normalized.toLowerCase())]
      .slice(0, this.maxRecent);

    this.persistSettings({recentTypes: merged});
  }

  setSidebarOrder(order: string[]): void {
    const normalizedOrder = order.map(item => item.trim()).filter(Boolean);
    this.persistSettings({sidebarOrder: [...new Set(normalizedOrder)]});
  }

  private initializeForUser(userId: number, persisted: MediaTypeSettings | undefined): void {
    const normalizedPersisted = this.normalizeSettings(persisted);
    const legacy = this.readLegacySettings();
    const hasLegacy = legacy.customTypes.length > 0 || legacy.recentTypes.length > 0 || legacy.sidebarOrder.length > 0;

    if (!persisted && hasLegacy) {
      const migrated = this.normalizeSettings({
        customTypes: this.mergeTypes([...normalizedPersisted.customTypes, ...legacy.customTypes]),
        recentTypes: this.mergeRecent([...legacy.recentTypes, ...normalizedPersisted.recentTypes]),
        sidebarOrder: legacy.sidebarOrder.length ? legacy.sidebarOrder : normalizedPersisted.sidebarOrder,
      });
      this.settingsSubject.next(migrated);
      this.userService.updateUserSetting(userId, 'mediaTypeSettings', migrated);
      this.clearLegacySettings();
      return;
    }

    this.settingsSubject.next(normalizedPersisted);
    this.clearLegacySettings();
  }

  private persistSettings(partial: Partial<ResolvedMediaTypeSettings>): void {
    const next = this.normalizeSettings({...this.settings, ...partial});
    this.settingsSubject.next(next);
    this.clearLegacySettings();

    const userId = this.userService.getCurrentUser()?.id;
    if (userId != null) {
      this.userService.updateUserSetting(userId, 'mediaTypeSettings', next);
    }
  }

  private normalizeSettings(settings: MediaTypeSettings | ResolvedMediaTypeSettings | undefined): ResolvedMediaTypeSettings {
    return {
      customTypes: this.mergeTypes(settings?.customTypes ?? []),
      recentTypes: this.mergeRecent(settings?.recentTypes ?? []),
      sidebarOrder: this.normalizeStringList(settings?.sidebarOrder ?? []),
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

  private readLegacySettings(): ResolvedMediaTypeSettings {
    return this.normalizeSettings({
      customTypes: [
        ...(this.localStorageService.get<string[]>(this.customMediaTypesKey) ?? []),
        ...(this.localStorageService.get<string[]>(this.legacyBookTypesKey) ?? []),
      ],
      recentTypes: this.localStorageService.get<string[]>(this.recentMediaTypesKey) ?? [],
      sidebarOrder: this.localStorageService.get<string[]>(this.sidebarBookTypeOrderKey) ?? [],
    });
  }

  private clearLegacySettings(): void {
    this.localStorageService.remove(this.customMediaTypesKey);
    this.localStorageService.remove(this.legacyBookTypesKey);
    this.localStorageService.remove(this.recentMediaTypesKey);
    this.localStorageService.remove(this.sidebarBookTypeOrderKey);
  }
}