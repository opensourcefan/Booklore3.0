import {Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {TranslocoPipe} from '@jsverse/transloco';
import {CbxHeaderService, CbxHeaderState} from './cbx-header.service';
import {ReaderIconComponent} from '../../../ebook-reader';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-cbx-header',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReaderIconComponent],
  templateUrl: './cbx-header.component.html',
  styleUrls: ['./cbx-header.component.scss']
})
export class CbxHeaderComponent implements OnInit, OnDestroy {
  private headerService = inject(CbxHeaderService);
  private destroy$ = new Subject<void>();

  @Input() isCurrentPageBookmarked = false;
  @Input() currentPageHasNotes = false;
  @Input() aiEnabled = false;
  @Input() aiWorking = false;
  @Input() aiReady = false;
  @Input() aiScanned = false;
  @Input() aiPanelCount = 0;
  @Input() aiPageCount = 0;
  @Input() isPinned = false;
  @Input() panelTravelFactor = 1;
  @Input() panelTravelControlsVisible = false;

  @Output() aiPanelDetection = new EventEmitter<void>();
  @Output() aiRescan = new EventEmitter<void>();
  @Output() aiDeleteScan = new EventEmitter<void>();
  @Output() aiOpenSettings = new EventEmitter<void>();
  @Output() togglePin = new EventEmitter<void>();
  @Output() panelTravelFactorChange = new EventEmitter<number>();

  isVisible = true;
  overflowOpen = false;
  aiMenuOpen = false;
  panelAdjustOpen = false;
  readonly pinIconData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOsAAADWCAMAAAAHMIWUAAAAclBMVEX6+voAAAD///8qKirX19cSEhLq6upqampKSkouLi6pqanAwMDNzc2Xl5eFhYXw8PDd3d0jIyP29vaxsbGNjY0JCQl1dXU3NzfT09O4uLgbGxtjY2M/Pz+goKDc3NwyMjJbW1tMTExxcXGjo6N8fHwkJCSY1ttdAAAESUlEQVR4nO2d7VriMBBG6QAFVCwUBEFEUPb+b3HFfVZmSm1DE+hMfM/vSZ855qspSex0AAAAAAAAAAAAAAAAAAAAqiC6fcl2oM5sPmjIfGXKlnrrxINNakeWJj6mn0yzthXcefF0TeZmKjbzVU36bSu44t2EP2nbwZUQrnnbEq6kv6deA/TX3+RqZmzq5F1f133bCu6w+XU/u3Nlcyp1MDO/0viU9TIjR9LpqdSdHdcZa44Pjmk3KqQAPji9uLoOWSE7qh1asrx7TonTPSsysOT6enHiolrvLbluny7sfKK3jgwt6T5T37PU3+pdKeuzAnZmnCOi9yWL+tx3PN6th+uBV2ztdMkn5CR5N6ZKK579elId/MyDzVVroVWOK9OnBY+11VuPyAX7rtr1jceaWaafoA+W/7DadcRCLc2t39Cuiau9FnyEzzvurobe+hlwLY2EqyHgWhoJV0PAtTQSroaAa2kkXA0B19JIuBoCrqWRcDUEXEsj4WoIuJZGwtUQcC2NhKsh4FoaCVdDwLU0Eq6GgGtpJFwNAdfSSLgagm9/dne1uG2NOnyfrLtr385xlf9QOkgauSbJIbNlSz1+kqPONZ+K4J2h4+rFLfD19Vo4fzed2JGVm8KP1OyVHhTjzYzG56r9mj3wvWIBK7JnDbh+IhGnc/79dZ4tyNJDMe/ltjZvei4embXQZ88P5o9drjwhmheKdfUfvsoKt6PsXOuHekNZcq++Yhcy4cfcOWPKCmWrB+/WKQ4yHxelW2zHqgdjSmULXl2YrDjnkiQbzUd1SBy2arBmoTvxAMVX4BRa8KW1+vWIV/EIxbOsaMGvjfKkR/6M6rNpLSJPdjY+cy4O12lduourUZZNxxX5MjLS6SpnjPr3wh+fI3r9TKWsmG+8RlB+hdle47wjpguvy+FoyytW5Sln/jrr1/JEb1B4SFQs5Z4888vZs7ppmAQDQgeWn+93T1GxCqedP6y3+o4nYt5xvTznZogm7P8aS2woVrdoF++x/m+x4puVtkbMr+kJcVlayn4K0LZmpyRsbvyT8UaXq5j+m78esgfyb8zKXNlLUz/EhChG4uov6beGL+d2nRD1mrEbBJss+q/I+ymzQ5YGIGMd9rIvdNcmZ8PwetQNwIhd1KVrIM68b/WswuFerxsS4GbaCnZt6wmu67psW09wXdd123qC67rquqorm9Yn3BxdbVis1IOj66cOCnAd+s8oW8Ce7wcJxlrdT5PUW4z6DrBLXZ8cwtebg8KNE0RZr54Je3F+3NbHb7X+Ox2XW8HZz3Bjl/i2nTyQrm1nc13gGidwjRO4xglc4wSucQLXOIFrnMA1TuAaJ3CNE7jGCVzjBK5xAtc4gWuc8BMazQ5S2oEfllO3DyI0+feGiW7sqmzDTPTVetwu/3WecqTtJMpVoHw1n9+b3vVxAcb3twAAAAAAAAAAAAAAAAAAAAAAAAAAGOIvQRw6+xPF4J0AAAAASUVORK5CYII=';
  state: CbxHeaderState = {
    isFullscreen: false,
    isSlideshowActive: false,
    isMagnifierActive: false,
    isPanelModeEnabled: false
  };

  get bookTitle(): string {
    return this.headerService.title;
  }

  ngOnInit(): void {
    this.headerService.forceVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => this.isVisible = visible);

    this.headerService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.state = state);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onOpenSidebar(): void {
    this.headerService.openSidebar();
  }

  onOpenSettings(): void {
    this.headerService.openQuickSettings();
  }

  onToggleBookmark(): void {
    this.headerService.toggleBookmark();
  }

  onOpenNoteDialog(): void {
    this.headerService.openNoteDialog();
  }

  onToggleFullscreen(): void {
    this.headerService.toggleFullscreen();
  }

  onToggleSlideshow(): void {
    this.headerService.toggleSlideshow();
  }

  onToggleMagnifier(): void {
    this.headerService.toggleMagnifier();
  }

  onShowShortcutsHelp(): void {
    this.headerService.showShortcutsHelp();
  }

  onTogglePanelMode(): void {
    this.headerService.togglePanelMode();
  }

  onAiPanelDetection(): void {
    this.aiPanelDetection.emit();
  }

  onAiRescan(): void {
    this.aiRescan.emit();
  }

  onAiDeleteScan(): void {
    this.aiDeleteScan.emit();
  }

  onAiOpenSettings(): void {
    this.aiOpenSettings.emit();
  }

  onToggleAiMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.aiMenuOpen = !this.aiMenuOpen;
    if (this.aiMenuOpen) {
      this.overflowOpen = false;
    }
  }

  closeMenus(): void {
    this.aiMenuOpen = false;
    this.overflowOpen = false;
    this.panelAdjustOpen = false;
  }

  onTogglePanelAdjust(event: MouseEvent): void {
    event.stopPropagation();
    this.panelAdjustOpen = !this.panelAdjustOpen;
  }

  onPanelTravelDelta(delta: number): void {
    const next = Math.min(2.5, Math.max(0.4, this.panelTravelFactor + delta));
    this.panelTravelFactorChange.emit(Number(next.toFixed(2)));
  }

  onPanelTravelInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = Number(target.value);
    if (Number.isFinite(value)) {
      this.panelTravelFactorChange.emit(Math.min(2.5, Math.max(0.4, value)));
    }
  }

  onTogglePin(): void {
    this.togglePin.emit();
  }

  onClose(): void {
    this.headerService.close();
  }
}
