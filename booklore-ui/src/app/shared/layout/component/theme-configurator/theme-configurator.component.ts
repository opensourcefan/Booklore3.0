import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
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
  private readonly presetPalettes = (Aura.primitive ?? {}) as Record<string, ColorPalette>;

  readonly selectedPrimaryColor = computed(() => this.configService.appState().primary);
  readonly selectedSurfaceColor = computed(() => this.configService.appState().surface);

  readonly hasCustomPrimary = computed(() => !!this.configService.appState().customPrimaryColor);
  readonly hasCustomSurface = computed(() => !!this.configService.appState().customSurfaceColor);

  readonly primaryColors = computed<Palette[]>(() => {
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
        palette: this.presetPalettes[name] ?? {}
      }))
    );
  });

  readonly customPrimaryInput = signal('');
  readonly customSurfaceInput = signal('');
  private lastAppliedPrimaryHex = '';
  private lastAppliedSurfaceHex = '';

  readonly effectivePrimaryHex = computed(() => this.resolvePrimaryHex());
  readonly effectiveSurfaceHex = computed(() => this.resolveSurfaceHex());

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

  readonly primaryPickerHex = computed(() => this.primaryParsedColor() ?? this.effectivePrimaryHex());
  readonly surfacePickerHex = computed(() => this.surfaceParsedColor() ?? this.effectiveSurfaceHex());

  constructor() {
    effect(() => {
      const primaryHex = this.effectivePrimaryHex();
      const surfaceHex = this.effectiveSurfaceHex();

      if (primaryHex && primaryHex !== this.lastAppliedPrimaryHex) {
        this.syncDraftInput('primary', primaryHex);
      }

      if (surfaceHex && surfaceHex !== this.lastAppliedSurfaceHex) {
        this.syncDraftInput('surface', surfaceHex);
      }
    });
  }

  updateColors(event: Event, type: 'primary' | 'surface', color: { name: string; palette?: ColorPalette }) {
    this.configService.clearCustomColor(type);
    this.configService.appState.update((state) => ({
      ...state,
      [type]: color.name
    }));
    this.syncDraftInput(type, this.resolvePresetHex(type, color));
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
      this.syncDraftInput(area, hex);
      this.configService.setCustomColor(area, hex);
    } catch {
      // validation prevents reaching here
    }
  }

  resetCustomColor(area: 'primary' | 'surface'): void {
    this.configService.clearCustomColor(area);
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

  private resolvePrimaryHex(): string {
    const state = this.configService.appState();

    if (state.customPrimaryColor) {
      return state.customPrimaryColor;
    }

    const primaryName = state.primary ?? 'green';
    if (primaryName === 'noir') {
      return this.resolveSurfacePaletteValue('0') || '#ffffff';
    }

    return this.presetPalettes[primaryName]?.['500'] ?? '';
  }

  private resolveSurfaceHex(): string {
    const state = this.configService.appState();

    if (state.customSurfaceColor) {
      return state.customSurfaceColor;
    }

    return this.resolveSurfacePaletteValue('500');
  }

  private resolveSurfacePaletteValue(shade: string): string {
    const state = this.configService.appState();

    if (state.customSurfaceGenerated) {
      const customPalette = {
        0: state.customSurfaceGenerated[50],
        ...state.customSurfaceGenerated,
      } as Record<string | number, string>;
      return customPalette[shade] ?? customPalette[Number(shade)] ?? state.customSurfaceColor ?? '';
    }

    const surfaceName = state.surface ?? 'ash';
    return this.surfaces.find(surface => surface.name === surfaceName)?.palette[shade] ?? '';
  }

  private resolvePresetHex(area: 'primary' | 'surface', color: { name: string; palette?: ColorPalette }): string {
    if (area === 'surface') {
      return color.palette?.['500'] ?? '';
    }

    if (color.name === 'noir') {
      return this.resolveSurfacePaletteValue('0') || '#ffffff';
    }

    return color.palette?.['500'] ?? '';
  }

  private syncDraftInput(area: 'primary' | 'surface', hex: string): void {
    if (!hex) {
      return;
    }

    if (area === 'primary') {
      this.customPrimaryInput.set(hex);
      this.lastAppliedPrimaryHex = hex;
      return;
    }

    this.customSurfaceInput.set(hex);
    this.lastAppliedSurfaceHex = hex;
  }
}