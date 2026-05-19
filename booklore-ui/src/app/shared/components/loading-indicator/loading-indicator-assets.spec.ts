import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('Loading indicator asset mapping', () => {
  it('uses the standalone webp asset for dedicated loading indicators', () => {
    const component = readWorkspaceFile('src/app/shared/components/loading-indicator/loading-indicator.component.ts');
    const styles = readWorkspaceFile('src/styles.scss');
    const standaloneSpinnerBlock = styles.match(/\.pi\.pi-spinner\.bl-standalone-spinner\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const progressSpinnerBlock = styles.match(/p-progressspinner::before,[\s\S]*?\.p-progress-spinner::before\s*\{[\s\S]*?\}/)?.[0] ?? '';

    expect(component).toContain('src="assets/images/loaders/loading3-transparent.webp"');
    expect(component).not.toContain('loading="eager"');
    expect(component).toContain('animation: bl-loader-reveal 0s step-end var(--bl-loader-delay, 200ms) forwards;');
    expect(styles).toContain("--bl-loader-standalone-image: url('assets/images/loaders/loading3-transparent.webp');");
    expect(standaloneSpinnerBlock).toContain('background-image: var(--bl-loader-standalone-image);');
    expect(progressSpinnerBlock).toContain('background-image: var(--bl-loader-standalone-image);');
  });

  it('uses the compact webp asset for icon-based spinners', () => {
    const styles = readWorkspaceFile('src/styles.scss');
    const iconSpinnerBlock = styles.match(/\.pi\.pi-spinner\s*\{[\s\S]*?\}/)?.[0] ?? '';

    expect(styles).toContain("--bl-loader-inline-image: url('assets/images/loaders/loading-icons-buttons.webp');");
    expect(iconSpinnerBlock).toContain('animation: bl-loader-reveal 0s step-end var(--bl-loader-delay) forwards !important;');
    expect(iconSpinnerBlock).toContain('background-image: var(--bl-loader-inline-image);');
  });

  it('covers PrimeNG SVG spinner fallbacks for inline and standalone loaders', () => {
    const styles = readWorkspaceFile('src/styles.scss');
    const svgSpinnerBlock = styles.match(/svg\[data-p-icon='spinner'\],\s*\.p-button-loading-icon svg\.p-icon-spin\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const standaloneSvgSpinnerBlock = styles.match(/svg\[data-p-icon='spinner'\]\.p-datatable-loading-icon,[\s\S]*?svg\[data-p-icon='spinner'\]\.p-virtualscroller-loading-icon\s*\{[\s\S]*?\}/)?.[0] ?? '';

    expect(svgSpinnerBlock).toContain('animation: bl-loader-reveal 0s step-end var(--bl-loader-delay) forwards !important;');
    expect(svgSpinnerBlock).toContain('background-image: var(--bl-loader-inline-image);');
    expect(svgSpinnerBlock).toContain('color: transparent !important;');
    expect(styles).toContain("svg[data-p-icon='spinner'] > *");
    expect(standaloneSvgSpinnerBlock).toContain('width: var(--bl-loader-size);');
    expect(standaloneSvgSpinnerBlock).toContain('background-image: var(--bl-loader-standalone-image);');
  });

  it('delays loader reveal and darkens inline loaders only on filled green buttons', () => {
    const styles = readWorkspaceFile('src/styles.scss');
    const delayedOverlayBlock = styles.match(/\.fullscreen-loader,[\s\S]*?\.p-virtualscroller-loader-mask\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const iconSpinnerBlock = styles.match(/\.pi\.pi-spinner\s*\{[\s\S]*?\}/)?.[0] ?? '';

    expect(styles).toContain('--bl-loader-delay: 200ms;');
    expect(styles).toContain('@keyframes bl-loader-reveal');
    expect(delayedOverlayBlock).toContain('animation: bl-loader-reveal 0s step-end var(--bl-loader-delay) forwards;');
    expect(iconSpinnerBlock).toContain('animation: bl-loader-reveal 0s step-end var(--bl-loader-delay) forwards !important;');
    expect(iconSpinnerBlock).toContain('filter: var(--bl-loader-inline-filter);');
    expect(styles).toContain('.p-button.p-button-primary:not(.p-button-outlined):not(.p-button-text):not(.p-button-link),');
    expect(styles).toContain('--bl-loader-inline-filter: brightness(0.82) saturate(0.9);');
  });
});
