import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, effect, inject} from '@angular/core';
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

    this.configService.setThemeSelection(type, normalized);
    event.stopPropagation();
  }

  applyRecentColor(event: Event, type: ThemeColorType, color: string): void {
    this.configService.setThemeSelection(type, color);
    event.stopPropagation();
  }

  isCustomColorSelected(type: ThemeColorType): boolean {
    return normalizeHexColor(this.configService.appState()[type] ?? null) != null;
  }

  isActiveRecentColor(type: ThemeColorType, color: string): boolean {
    return normalizeHexColor(this.configService.appState()[type] ?? null) === normalizeHexColor(color);
  }
}
