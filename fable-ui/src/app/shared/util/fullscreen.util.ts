/** Cross-browser Fullscreen helpers (standard API + WebKit aliases). */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenDocument;
  return doc.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function requestAppFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  const el = target as FullscreenElement;
  if (typeof el.requestFullscreen === 'function') {
    return el.requestFullscreen().catch(() => undefined);
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    return Promise.resolve(el.webkitRequestFullscreen()).catch(() => undefined);
  }
  return Promise.resolve();
}

export function exitAppFullscreen(doc: Document = document): Promise<void> {
  const d = doc as FullscreenDocument;
  if (typeof doc.exitFullscreen === 'function') {
    return doc.exitFullscreen().catch(() => undefined);
  }
  if (typeof d.webkitExitFullscreen === 'function') {
    return Promise.resolve(d.webkitExitFullscreen()).catch(() => undefined);
  }
  return Promise.resolve();
}

export function toggleAppFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  if (getFullscreenElement()) {
    return exitAppFullscreen();
  }
  return requestAppFullscreen(target);
}
