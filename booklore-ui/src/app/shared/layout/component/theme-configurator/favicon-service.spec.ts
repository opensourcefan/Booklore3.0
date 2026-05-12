import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {FaviconService} from './favicon-service';

describe('FaviconService', () => {
  let service: FaviconService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FaviconService],
    });

    service = TestBed.inject(FaviconService);
  });

  afterEach(() => {
    document.head.querySelectorAll("link[rel='icon']").forEach(icon => icon.remove());
    vi.restoreAllMocks();
  });

  it('revokes the previous favicon object URL before storing a new one', () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:theme-one')
      .mockReturnValueOnce('blob:theme-two');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((_objectUrl: string) => undefined);

    service.updateFavicon('#112233');
    service.updateFavicon('#445566');

    const favicon = document.head.querySelector("link[rel='icon']") as HTMLLinkElement;

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:theme-one');
    expect(favicon.getAttribute('href')).toBe('blob:theme-two');
  });
});