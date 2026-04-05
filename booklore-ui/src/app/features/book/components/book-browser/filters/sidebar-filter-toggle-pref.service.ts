import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Subject} from 'rxjs';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {LocalStorageService} from '../../../../../shared/service/local-storage.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {filter} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SidebarFilterTogglePrefService {

  private readonly STORAGE_KEY = 'showSidebarFilter';
  private readonly messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly userService = inject(UserService);

  private readonly showFilterSubject = new BehaviorSubject<boolean>(window.innerWidth > 768);
  readonly showFilter$ = this.showFilterSubject.asObservable();
  private readonly mobileFilterToggleSubject = new Subject<MouseEvent>();
  readonly mobileFilterToggle$ = this.mobileFilterToggleSubject.asObservable();

  constructor() {
    this.loadFromStorage();
    this.userService.userState$.pipe(
      filter(state => !!state?.user && state.loaded)
    ).subscribe(state => {
      this.loadFromUserSettings(state.user!.id, state.user!.userSettings.showSidebarFilter);
    });
  }

  get selectedShowFilter(): boolean {
    return this.showFilterSubject.value;
  }

  set selectedShowFilter(value: boolean) {
    if (this.showFilterSubject.value !== value) {
      this.showFilterSubject.next(value);
      this.savePreference(value);
    }
  }

  toggle(): void {
    this.selectedShowFilter = !this.selectedShowFilter;
  }

  requestMobileFilterToggle(event: MouseEvent): void {
    this.mobileFilterToggleSubject.next(event);
  }

  private savePreference(value: boolean): void {
    try {
      const isNarrow = window.innerWidth <= 768;
      if (isNarrow) {
        this.showFilterSubject.next(false);
        return;
      }

      const userId = this.userService.getCurrentUser()?.id;
      if (userId != null) {
        this.userService.updateUserSetting(userId, 'showSidebarFilter', value);
        this.localStorageService.remove(this.STORAGE_KEY);
      } else {
        this.localStorageService.set(this.STORAGE_KEY, value);
      }
    } catch (_e) {
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('book.filterPref.toast.saveFailedSummary'),
        detail: this.t.translate('book.filterPref.toast.saveFailedDetail'),
        life: 3000
      });
    }
  }

  private loadFromStorage(): void {
    const isNarrow = window.innerWidth <= 768;
    if (isNarrow) {
      this.showFilterSubject.next(false);
    } else {
      const saved = this.localStorageService.get<boolean>(this.STORAGE_KEY);
      this.showFilterSubject.next(saved ?? true);
    }
  }

  private loadFromUserSettings(userId: number, persisted: boolean | undefined): void {
    const isNarrow = window.innerWidth <= 768;
    if (isNarrow) {
      this.showFilterSubject.next(false);
      return;
    }

    if (typeof persisted === 'boolean') {
      this.showFilterSubject.next(persisted);
      this.localStorageService.remove(this.STORAGE_KEY);
      return;
    }

    const legacy = this.localStorageService.get<boolean>(this.STORAGE_KEY);
    if (typeof legacy === 'boolean') {
      this.showFilterSubject.next(legacy);
      this.userService.updateUserSetting(userId, 'showSidebarFilter', legacy);
      this.localStorageService.remove(this.STORAGE_KEY);
    }
  }
}
