import {Component, ElementRef, HostBinding, Input, OnDestroy, OnInit, ViewChild, inject} from '@angular/core';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {animate, state, style, transition, trigger} from '@angular/animations';
import {Subscription, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';
import {MenuService} from './service/app.menu.service';
import {AsyncPipe, NgClass} from '@angular/common';
import {Ripple} from 'primeng/ripple';
import {Button} from 'primeng/button';
import {Menu} from 'primeng/menu';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {DialogLauncherService} from '../../../services/dialog-launcher.service';
import {BookDialogHelperService} from '../../../../features/book/components/book-browser/book-dialog-helper.service';
import {IconDisplayComponent} from '../../../components/icon-display/icon-display.component';
import {Tooltip} from 'primeng/tooltip';
import {IconSelection} from '../../../service/icon-picker.service';
import {TranslocoPipe} from '@jsverse/transloco';
import {MenuItem} from 'primeng/api';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {LocalStorageService} from '../../../service/local-storage.service';
import {ThumbnailPrefetchService} from '../../../../features/book/service/thumbnail-prefetch.service';
import {DirectoryFilterService} from '../../../../features/book/service/directory-filter.service';

export interface AppMenuItem extends MenuItem {
  type?: string;
  visibilityKey?: string;
  class?: string;
  badgeClass?: string;
  hasDropDown?: boolean;
  hasCreate?: boolean;
  iconType?: 'PRIME_NG' | 'CUSTOM_SVG';
  menu?: AppMenuItem[];
  bookCount$?: Observable<number>;
  unhealthy$?: Observable<boolean>;
  items?: AppMenuItem[];
  prefetchLibraryId?: number;
}

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[app-menuitem]',
  templateUrl: './app.menuitem.component.html',
  styleUrls: ['./app.menuitem.component.scss'],
  imports: [
    RouterLink,
    NgClass,
    Ripple,
    AsyncPipe,
    Button,
    Menu,
    IconDisplayComponent,
    Tooltip,
    TranslocoPipe,
    CdkDropList,
    CdkDrag,
    CdkDragHandle
  ],
  animations: [
    trigger('children', [
      state('collapsed', style({
        height: '0'
      })),
      state('expanded', style({
        height: '*'
      })),
      transition('collapsed <=> expanded', animate('400ms cubic-bezier(0.86, 0, 0.07, 1)'))
    ])
  ]
})
export class AppMenuitemComponent implements OnInit, OnDestroy {
  @Input() item!: AppMenuItem;
  @Input() index!: number;
  @Input() @HostBinding('class.layout-root-menuitem') root!: boolean;
  @Input() parentKey!: string;
  @Input() menuKey!: string;
  @Input() reorderMode = false;
  @ViewChild('linkRef') linkRef!: ElementRef<HTMLAnchorElement>;

  hovered = false;
  active = false;
  key = "";
  canManipulateLibrary = false;
  admin = false;
  expandedItems = new Set<string>();
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;
  private suppressTapUntil = 0;

  get isRouteActive(): boolean {
    if (!this.item?.routerLink?.[0]) return false;
    if (this.router.url.split('?')[0] !== this.item.routerLink[0]) return false;
    // Don't highlight (e.g.) "All Books" when a Media Type filter is active —
    // those rows carry their own active state and should own the highlight.
    const filterParam = this.router.parseUrl(this.router.url).queryParams['filter'];
    if (typeof filterParam === 'string' &&
        (filterParam.includes('customMediaType:') || filterParam.includes('customBookType:'))) {
      return false;
    }
    return true;
  }

  private userStateSubscription: Subscription;
  menuSourceSubscription: Subscription;
  menuResetSubscription: Subscription;
  private routerSubscription: Subscription;

  public router = inject(Router);
  private menuService = inject(MenuService);
  private userService = inject(UserService);
  private dialogLauncher = inject(DialogLauncherService);
  private bookDialogHelperService = inject(BookDialogHelperService);
  private localStorageService = inject(LocalStorageService);
  private thumbnailPrefetchService = inject(ThumbnailPrefetchService);
  private directoryFilterService = inject(DirectoryFilterService);

  constructor() {
    this.userStateSubscription = this.userService.userState$.subscribe(userState => {
      if (userState?.user) {
        this.canManipulateLibrary = userState.user.permissions.canManageLibrary;
        this.admin = userState.user.permissions.admin;
      }
    });

    this.menuSourceSubscription = this.menuService.menuSource$.subscribe(value => {
      Promise.resolve(null).then(() => {
        if (value.routeEvent) {
          this.active = (value.key === this.key || value.key.startsWith(this.key + '-')) ? true : false;
        } else {
          if (value.key !== this.key && !value.key.startsWith(this.key + '-')) {
            this.active = false;
          }
        }
      });
    });

    this.menuResetSubscription = this.menuService.resetSource$.subscribe(() => {
      this.active = false;
    });

    this.routerSubscription = this.router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.item.routerLink) {
          this.updateActiveStateFromRoute();
        }
      });
  }

  ngOnInit() {
    const rootKey = this.menuKey ? this.menuKey + '-' : '';
    this.key = this.parentKey ? this.parentKey + '-' + this.index : rootKey + String(this.index);
    this.expandedItems.add(this.key);
    if (this.item.routerLink) {
      this.updateActiveStateFromRoute();
    }
  }

  ngOnDestroy() {
    this.userStateSubscription?.unsubscribe();
    this.menuSourceSubscription?.unsubscribe();
    this.menuResetSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }

  toggleExpand(key: string) {
    if (this.reorderMode) {
      return;
    }

    if (this.expandedItems.has(key)) {
      this.expandedItems.delete(key);
    } else {
      this.expandedItems.add(key);
    }
  }

  isExpanded(key: string): boolean {
    return this.reorderMode || this.expandedItems.has(key);
  }

  onChildDrop(event: CdkDragDrop<AppMenuItem[]>): void {
    if (!this.reorderMode || !this.root || !this.item?.items || event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.item.items, event.previousIndex, event.currentIndex);
    this.saveNestedOrder();
  }

  isChildSortable(): boolean {
    return this.reorderMode && this.root && !!this.item?.items?.length;
  }

  updateActiveStateFromRoute() {
    const activeRoute = this.router.isActive(this.item.routerLink[0], {
      paths: 'exact',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored'
    });
    if (activeRoute) {
      this.menuService.onMenuStateChange({key: this.key, routeEvent: true});
    }
  }

  itemClick(event: Event) {
    if (this.reorderMode) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.shouldSuppressTap()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.item.disabled) {
      event.preventDefault();
      return;
    }

    this.clearScopedDirectoryFilterIfReclickingActiveRoute();

    if (this.item.command) {
      this.item.command({originalEvent: event, item: this.item});
    }
    if (this.item.items) {
      this.active = !this.active;
    } else {
      this.active = true;
    }
    this.menuService.onMenuStateChange({key: this.key});
  }

  openDialog(item: AppMenuItem) {
    if (this.reorderMode) {
      return;
    }

    if (item.type === 'library' && this.canManipulateLibrary) {
      this.dialogLauncher.openLibraryCreateDialog();
    }
    if (item.type === 'magicShelf') {
      this.dialogLauncher.openMagicShelfCreateDialog();
    }
    if (item.type === 'shelf') {
      this.bookDialogHelperService.openShelfCreatorDialog();
    }
  }

  triggerLink() {
    if (this.reorderMode) {
      return;
    }

    if (this.shouldSuppressTap()) {
      return;
    }

    if (this.item.routerLink && !this.item.items && this.linkRef) {
      this.linkRef.nativeElement.click();
    }
  }

  onTouchStart(event: TouchEvent): void {
    this.prefetchItemThumbnails();

    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    if (touch && this.touchStartX != null && this.touchStartY != null) {
      const deltaX = Math.abs(touch.clientX - this.touchStartX);
      const deltaY = Math.abs(touch.clientY - this.touchStartY);
      if (deltaX > 8 || deltaY > 8) {
        this.suppressTapUntil = Date.now() + 250;
      }
    }
    this.touchStartX = null;
    this.touchStartY = null;
  }

  onTouchCancel(): void {
    this.touchStartX = null;
    this.touchStartY = null;
    this.suppressTapUntil = Date.now() + 250;
  }

  formatCount(count: number | null | undefined): string {
    if (count == null) return '0';
    if (count >= 1000) return Math.floor(count / 1000) + 'K';
    return count.toString();
  }

  getIconSelection(): IconSelection | null {
    if (!this.item.icon) return null;

    return {
      type: this.item.iconType || 'PRIME_NG',
      value: this.item.icon
    };
  }

  private saveNestedOrder(): void {
    if (!this.menuKey || !Array.isArray(this.item?.items)) {
      return;
    }

    const order = this.item.items!.map((child: AppMenuItem) => this.getItemOrderId(child));
    this.localStorageService.set(`sidebarNestedOrder_${this.menuKey}`, order);
  }

  private getItemOrderId(item: AppMenuItem): string {
    const link = Array.isArray(item?.routerLink) ? item.routerLink[0] : item?.routerLink;
    return String(link ?? item?.label ?? '');
  }

  prefetchItemThumbnails(): void {
    if (this.item.prefetchLibraryId == null) {
      return;
    }

    this.thumbnailPrefetchService.prefetchLibrary(this.item.prefetchLibraryId);
  }

  private shouldSuppressTap(): boolean {
    return Date.now() < this.suppressTapUntil;
  }

  private clearScopedDirectoryFilterIfReclickingActiveRoute(): void {
    const routerLink = Array.isArray(this.item.routerLink) ? this.item.routerLink[0] : this.item.routerLink;
    if (!routerLink || this.item.items) {
      return;
    }

    const currentPath = this.router.url.split('?')[0].split('#')[0];
    if (currentPath !== routerLink) {
      return;
    }

    this.directoryFilterService.clearScope(this.directoryFilterService.getScopeKeyFromUrl(currentPath));
  }

}
