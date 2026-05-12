import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {RadioButtonModule} from 'primeng/radiobutton';
import {ToggleSwitchModule} from 'primeng/toggleswitch';

import Aura from '../theme-palette-extend';

import {AppConfigService} from '../../../service/app-config.service';
import {TranslocoDirective} from '@jsverse/transloco';
import {FaviconService} from './favicon-service';
import {normalizeHexColor, ThemeColorType} from '../../../util/theme-color.util';

type ColorPalette = Record<string, string>;

interface Palette {
  name: string;
  palette: ColorPalette;
}

@Component({
  selector: 'app-theme-configurator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-configurator.component.html',
  host: {
    class: 'config-panel hidden'
  },
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    RadioButtonModule,
    ToggleSwitchModule,
    TranslocoDirective
  ]
})
export class ThemeConfiguratorComponent {
  readonly configService = inject(AppConfigService);
  readonly faviconService = inject(FaviconService);

  @ViewChild('primaryColorInput') private primaryColorInput?: ElementRef<HTMLInputElement>;
  @ViewChild('surfaceColorInput') private surfaceColorInput?: ElementRef<HTMLInputElement>;

  readonly surfaces = this.configService.surfaces;

  readonly selectedPrimaryColor = computed(() => this.configService.appState().primary);
  readonly selectedSurfaceColor = computed(() => this.configService.appState().surface);
  readonly primaryInputColor = computed(() => this.configService.getThemeInputColor('primary'));
  readonly surfaceInputColor = computed(() => this.configService.getThemeInputColor('surface'));
  readonly recentPrimaryColors = computed(() => this.configService.getRecentThemeColors('primary'));
  readonly recentSurfaceColors = computed(() => this.configService.getRecentThemeColors('surface'));

  readonly faviconColor = computed(() => {
    const name = this.selectedPrimaryColor() ?? 'green';
    const presetPalette = (Aura.primitive ?? {}) as Record<string, ColorPalette>;
    const colorPalette = presetPalette[name];
    return colorPalette?.[500] ?? name;
  });

  private readonly _faviconSyncEffect = effect(() => {
    this.faviconService.updateFavicon(this.faviconColor());
  });

  private readonly customPickerInvoked = signal<Record<ThemeColorType, boolean>>({
    primary: false,
    surface: false,
  });

  readonly primaryColors = computed<Palette[]>(() => {
    const presetPalette = (Aura.primitive ?? {}) as Record<string, ColorPalette>;
    const colors = [
      'emerald', 'green', 'lime', 'orange', 'amber', 'yellow',
      'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
      'purple', 'fuchsia', 'pink', 'rose', 'red',
      'coralSunset', 'roseBlush', 'melonBlush', 'cottonCandy',
      'apricotSunrise', 'antiqueBronze', 'butteryYellow', 'vanillaCream',
      'citrusMint', 'freshMint', 'sagePearl', 'skyBlue','periwinkleCream',
      'pastelRoyalBlue', 'lavenderDream', 'dustyNeutral'
    ];
    return [{name: 'noir', palette: {}}].concat(
      colors.map(name => ({
        name,
        palette: presetPalette[name] ?? {}
      }))
    );
  });

  updateColors(event: Event, type: 'primary' | 'surface', color: { name: string; palette?: ColorPalette }) {
    this.configService.setThemeSelection(type, color.name);
    event.stopPropagation();
  }

  updateCustomColor(event: Event, type: ThemeColorType): void {
    const input = event.target as HTMLInputElement | null;
    const normalized = normalizeHexColor(input?.value ?? null);
    if (!normalized) {
      return;
    }

    this.customPickerInvoked.update(state => ({...state, [type]: true}));
    this.configService.setThemeSelection(type, normalized);
    event.stopPropagation();
  }

  openCustomColorPicker(event: Event, type: ThemeColorType): void {
    event.preventDefault();
    event.stopPropagation();
    this.customPickerInvoked.update(state => ({...state, [type]: true}));

    const input = this.getColorInput(type);
    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
  }

  applyRecentColor(event: Event, type: ThemeColorType, color: string): void {
    this.configService.setThemeSelection(type, color);
    event.stopPropagation();
  }

  isCustomMode(type: ThemeColorType): boolean {
    return this.customPickerInvoked()[type]
      || this.getRecentColors(type).length > 0
      || this.isCustomColorSelected(type);
  }

  isCustomColorSelected(type: ThemeColorType): boolean {
    return normalizeHexColor(this.configService.appState()[type] ?? null) != null;
  }

  isActiveRecentColor(type: ThemeColorType, color: string): boolean {
    return normalizeHexColor(this.configService.appState()[type] ?? null) === normalizeHexColor(color);
  }

  private getColorInput(type: ThemeColorType): HTMLInputElement | null {
    return type === 'primary'
      ? this.primaryColorInput?.nativeElement ?? null
      : this.surfaceColorInput?.nativeElement ?? null;
  }

  private getRecentColors(type: ThemeColorType): string[] {
    return this.configService.getRecentThemeColors(type);
  }
}
