import {Component, ElementRef, HostBinding, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {animate, state, style, transition, trigger} from '@angular/animations';
import {Subscription} from 'rxjs';
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
import {MenuItem} from 'primeng/api';
import {IconSelection} from '../../../service/icon-picker.service';
import {TranslocoPipe} from '@jsverse/transloco';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {LocalStorageService} from '../../../service/local-storage.service';

@Component({
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
  @Input() item: any;
  @Input() index!: number;
  @Input() @HostBinding('class.layout-root-menuitem') root!: boolean;
  @Input() parentKey!: string;
  @Input() menuKey!: string;
  @ViewChild('linkRef') linkRef!: ElementRef<HTMLAnchorElement>;
  readonly childDragStartDelay = {mouse: 220, touch: 350};

  hovered = false;
  active = false;
  key: string = "";
  canManipulateLibrary: boolean = false;
  admin: boolean = false;
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

  constructor(
    public router: Router,
    private menuService: MenuService,
    private userService: UserService,
    private dialogLauncher: DialogLauncherService,
    private bookDialogHelperService: BookDialogHelperService,
    private localStorageService: LocalStorageService
  ) {
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
    if (this.expandedItems.has(key)) {
      this.expandedItems.delete(key);
    } else {
      this.expandedItems.add(key);
    }
  }

  isExpanded(key: string): boolean {
    return this.expandedItems.has(key);
  }

  onChildDrop(event: CdkDragDrop<any[]>): void {
    if (!this.root || !this.item?.items || event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.item.items, event.previousIndex, event.currentIndex);
    this.saveNestedOrder();
  }

  isChildSortable(): boolean {
    return this.root && !!this.item?.items?.length;
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
    if (this.shouldSuppressTap()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.item.disabled) {
      event.preventDefault();
      return;
    }
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

  openDialog(item: any) {
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
    if (this.shouldSuppressTap()) {
      return;
    }

    if (this.item.routerLink && !this.item.items && this.linkRef) {
      this.linkRef.nativeElement.click();
    }
  }

  onTouchStart(event: TouchEvent): void {
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

    const order = this.item.items.map((child: any) => this.getItemOrderId(child));
    this.localStorageService.set(`sidebarNestedOrder_${this.menuKey}`, order);
  }

  private getItemOrderId(item: any): string {
    const link = Array.isArray(item?.routerLink) ? item.routerLink[0] : item?.routerLink;
    return String(link ?? item?.label ?? '');
  }

  private shouldSuppressTap(): boolean {
    return Date.now() < this.suppressTapUntil;
  }

}
