import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {RadioButtonModule} from 'primeng/radiobutton';
import {ToggleSwitchModule} from 'primeng/toggleswitch';

import Aura from '../theme-palette-extend';

import {AppConfigService} from '../../../service/app-config.service';
import {TranslocoDirective} from '@jsverse/transloco';
import {parseColorToHex} from '../../../util/color-utils';

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

  readonly surfaces = this.configService.surfaces;

  readonly selectedPrimaryColor = computed(() => this.configService.appState().primary);
  readonly selectedSurfaceColor = computed(() => this.configService.appState().surface);

  readonly hasCustomPrimary = computed(() => !!this.configService.appState().customPrimaryColor);
  readonly hasCustomSurface = computed(() => !!this.configService.appState().customSurfaceColor);

  readonly customPrimaryHex = computed(() => this.configService.appState().customPrimaryColor ?? '');
  readonly customSurfaceHex = computed(() => this.configService.appState().customSurfaceColor ?? '');

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

  readonly customPrimaryInput = signal('');
  readonly customSurfaceInput = signal('');
  private lastAppliedPrimaryHex = '';
  private lastAppliedSurfaceHex = '';

  readonly primaryParseError = computed(() => {
    const input = this.customPrimaryInput();
    if (!input.trim()) return null;
    try {
      parseColorToHex(input);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'Invalid color';
    }
  });

  readonly surfaceParseError = computed(() => {
    const input = this.customSurfaceInput();
    if (!input.trim()) return null;
    try {
      parseColorToHex(input);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'Invalid color';
    }
  });

  readonly primaryParsedColor = computed(() => {
    const input = this.customPrimaryInput();
    if (!input.trim()) return null;
    try {
      return parseColorToHex(input);
    } catch {
      return null;
    }
  });

  readonly surfaceParsedColor = computed(() => {
    const input = this.customSurfaceInput();
    if (!input.trim()) return null;
    try {
      return parseColorToHex(input);
    } catch {
      return null;
    }
  });

  updateColors(event: Event, type: 'primary' | 'surface', color: { name: string; palette?: ColorPalette }) {
    this.configService.clearCustomColor(type);
    this.configService.appState.update((state) => ({
      ...state,
      [type]: color.name
    }));
    event.stopPropagation();
  }

  onColorPickerChange(event: Event, area: 'primary' | 'surface'): void {
    const input = event.target as HTMLInputElement;
    const hex = input.value;
    if (hex) {
      const lastApplied = area === 'primary' ? this.lastAppliedPrimaryHex : this.lastAppliedSurfaceHex;
      if (hex === lastApplied) return;
      if (area === 'primary') {
        this.lastAppliedPrimaryHex = hex;
        this.customPrimaryInput.set(hex);
      } else {
        this.lastAppliedSurfaceHex = hex;
        this.customSurfaceInput.set(hex);
      }
      this.applyCustomColor(area);
    }
  }

  onTextInputChange(value: string, area: 'primary' | 'surface'): void {
    if (area === 'primary') {
      this.customPrimaryInput.set(value);
    } else {
      this.customSurfaceInput.set(value);
    }
  }

  onTextInputBlur(area: 'primary' | 'surface'): void {
    const input = area === 'primary' ? this.customPrimaryInput() : this.customSurfaceInput();
    if (input.trim()) {
      this.applyCustomColor(area);
    }
  }

  applyCustomColor(area: 'primary' | 'surface'): void {
    const input = area === 'primary' ? this.customPrimaryInput() : this.customSurfaceInput();
    try {
      const hex = parseColorToHex(input);
      this.configService.setCustomColor(area, hex);
    } catch {
      // validation prevents reaching here
    }
  }

  resetCustomColor(area: 'primary' | 'surface'): void {
    this.configService.clearCustomColor(area);
    if (area === 'primary') {
      this.customPrimaryInput.set('');
      this.lastAppliedPrimaryHex = '';
    } else {
      this.customSurfaceInput.set('');
      this.lastAppliedSurfaceHex = '';
    }
  }

  handleCustomPrimaryKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.applyCustomColor('primary');
    }
  }

  handleCustomSurfaceKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.applyCustomColor('surface');
    }
  }
}