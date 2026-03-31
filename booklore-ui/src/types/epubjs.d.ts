// ── Foliate custom element types (globally available) ──────────────────────

interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
}

interface FoliateLoadDetail {
  doc?: Document;
}

interface FoliateDrawAnnotationDetail {
  draw: (overlayerFn: (rects: DOMRectList, options: { color?: string; width?: number }) => SVGElement, options: { color: string }) => void;
  annotation: { value: string };
  doc: Document;
  range: Range;
}

interface FoliateRelocateDetail {
  cfi?: string;
  fraction?: number;
  section?: { current: number; total: number };
  location?: { current: number; next: number; total: number };
  time?: { section: number; total: number };
  tocItem?: { label?: string; href?: string };
  pageItem?: { href?: string; label?: string };
  range?: Range;
}

type FoliateSearchChunk =
  | string
  | { progress: number }
  | { subitems: ReadonlyArray<{ cfi: string; excerpt: { pre: string; match: string; post: string } }>; label: string };

interface FoliateRenderer {
  getContents?(): Array<{ index: number; doc: Document }> | null;
  heads?: HTMLElement[];
  feet?: HTMLElement[];
  setAttribute(key: string, value: string | number): void;
  removeAttribute(key: string): void;
  setStyles?(css: string): void;
}

interface FoliateViewBook {
  toc?: FoliateTocItem[];
  metadata?: Record<string, unknown>;
  getCover?(): Promise<Blob | null>;
}

interface IframeClickMessage {
  type: 'iframe-click';
  clientX: number;
  clientY: number;
  iframeLeft: number;
  iframeWidth: number;
  eventClientX: number;
  target: string;
}

interface FoliateView extends HTMLElement {
  open(file: File | object): Promise<void>;
  goTo(target: string | number): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  prev(): void;
  next(): void;
  renderer?: FoliateRenderer;
  getCFI(index: number, range: Range): string | null;
  deselect(): void;
  search(opts: { query: string; matchCase?: boolean; matchWholeWords?: boolean }): AsyncIterable<FoliateSearchChunk>;
  clearSearch?(): void;
  getSectionFractions?(): number[];
  book?: FoliateViewBook;
  addAnnotation(annotation: { value: string }): Promise<{ index: number; label: string } | undefined>;
  deleteAnnotation(annotation: { value: string }): Promise<void>;
  showAnnotation(annotation: { value: string }): Promise<void>;
  addEventListener(type: 'load', listener: (e: CustomEvent<FoliateLoadDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'relocate', listener: (e: CustomEvent<FoliateRelocateDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'error', listener: (e: CustomEvent<unknown>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'draw-annotation', listener: (e: CustomEvent<FoliateDrawAnnotationDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'show-annotation', listener: (e: CustomEvent<unknown>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

interface HTMLElementTagNameMap {
  'foliate-view': FoliateView;
}

// ─────────────────────────────────────────────────────────────────────────────

declare module 'epubjs' {
  export interface TocItem {
    id?: string;
    href: string;
    label: string;
    subitems?: TocItem[];
  }

  export interface Navigation {
    toc: TocItem[];
    get(target: string): TocItem | undefined;
  }

  export interface Location {
    start: {
      cfi: string;
      href: string;
      displayed: {
        page: number;
        total: number;
      };
      index: number;
    };
    end: {
      cfi: string;
      href: string;
    };
  }

  export interface Locations {
    total: number;
    generate(chars: number): Promise<void>;
    percentageFromCfi(cfi: string): number;
  }

  export interface SpineItem {
    href: string;
    index: number;
    cfi: string;
    document?: Document;
    cfiFromElement(element: Element): string;
  }

  export interface Spine {
    items: SpineItem[];
    get(href: string): SpineItem | null;
  }

  export interface Themes {
    register(name: string, theme: Record<string, string>): void;
    select(name: string): void;
    override(property: string, value: string): void;
    font(name: string): void;
    fontSize(size: string): void;
  }

  export interface Rendition {
    themes: Themes;
    display(target?: string): Promise<void>;
    prev(): Promise<void>;
    next(): Promise<void>;
    currentLocation(): Location | null;
    on(event: 'relocated', callback: (location: Location) => void): void;
    on(event: 'rendered', callback: (section: SpineItem) => void): void;
    on(event: 'keyup', callback: (event: KeyboardEvent) => void): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
  }

  export interface Book {
    loaded: {
      navigation: Promise<Navigation>;
    };
    navigation: Navigation;
    spine: Spine;
    locations: Locations;
    ready: Promise<void>;
    rendition: Rendition;
    renderTo(element: HTMLElement, options: {
      flow?: string;
      manager?: string;
      width?: string;
      height?: string;
      spread?: string;
      allowScriptedContent?: boolean;
    }): Rendition;
    canonical(href: string): string;
    epubProgress?: { cfi: string };
  }

  export class EpubCFI {
    compare(cfi1: string, cfi2: string): number;
  }

  export default function ePub(input: string | ArrayBuffer): Book;
}