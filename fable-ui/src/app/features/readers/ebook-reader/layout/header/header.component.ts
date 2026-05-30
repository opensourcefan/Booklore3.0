import {Component, DoCheck, inject, OnDestroy, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {TranslocoDirective} from '@jsverse/transloco';
import {ReaderHeaderService} from './header.service';
import {ReaderIconComponent} from '../../shared/icon.component';
import {Router} from '@angular/router';
import {MobileBackHandle, MobileBackNavigationService} from '../../../../../shared/service/mobile-back-navigation.service';

@Component({
  selector: 'app-reader-header',
  standalone: true,
  imports: [TranslocoDirective, ReaderIconComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class ReaderHeaderComponent implements OnInit, OnDestroy, DoCheck {
  private headerService = inject(ReaderHeaderService);
  private router = inject(Router);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private destroy$ = new Subject<void>();
  private overflowBackHandle: MobileBackHandle | null = null;

  isVisible = false;
  isCurrentCfiBookmarked = false;
  isFullscreen = false;
  overflowOpen = false;

  get bookTitle(): string {
    return this.headerService.title;
  }

  get currentTheme() {
    return this.headerService.currentState.theme;
  }

  ngOnInit(): void {
    this.headerService.forceVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => this.isVisible = visible);

    this.headerService.isCurrentCfiBookmarked$
      .pipe(takeUntil(this.destroy$))
      .subscribe(bookmarked => this.isCurrentCfiBookmarked = bookmarked);

    this.headerService.fullscreenState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(fs => this.isFullscreen = fs);
  }

  ngOnDestroy(): void {
    this.overflowBackHandle?.release(false);
    this.overflowBackHandle = null;
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngDoCheck(): void {
    if (this.overflowOpen) {
      if (!this.overflowBackHandle) {
        this.overflowBackHandle = this.mobileBackNavigation.register(() => {
          this.overflowOpen = false;
        });
      }
      return;
    }

    this.overflowBackHandle?.release();
    this.overflowBackHandle = null;
  }

  onShowChapters(): void {
    this.headerService.openSidebar();
  }

  onOpenNotes(): void {
    this.headerService.openLeftSidebar('notes');
  }

  onOpenSearch(): void {
    this.headerService.openLeftSidebar('search');
  }

  onCreateBookmark(): void {
    this.headerService.createBookmark();
  }

  onShowControls(): void {
    this.headerService.openControls();
  }

  onToggleFullscreen(): void {
    this.headerService.toggleFullscreen();
  }

  onShowHelp(): void {
    this.headerService.showShortcutsHelp();
  }

  onClose(): void {
    if (window.history.length <= 2) {
      this.router.navigate(['/dashboard']);
    } else {
      this.headerService.close();
    }
  }
}
