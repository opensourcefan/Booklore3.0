import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EventStreamContentType, fetchEventSource} from '@microsoft/fetch-event-source';
import {SseStreamService} from './sse-stream.service';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn()
}));

describe('SseStreamService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SseStreamService]
    });
    vi.mocked(fetchEventSource).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('streams parsed JSON events and completes when the stream closes', async () => {
    vi.mocked(fetchEventSource).mockImplementation(async (_url, options) => {
      await options.onopen?.(new Response(null, {
        status: 200,
        headers: {'content-type': `${EventStreamContentType};charset=UTF-8`}
      }));
      options.onmessage?.({data: '{"id":1}', event: 'message', id: '', retry: undefined});
      options.onclose?.();
    });

    const service = TestBed.inject(SseStreamService);
    const values: {id: number}[] = [];
    let completed = false;

    service.streamJson<{id: number}>('/api/test', {
      method: 'POST',
      headers: {'Authorization': 'Bearer token'},
      body: {bookId: 1}
    }).subscribe({
      next: (value) => values.push(value),
      complete: () => {
        completed = true;
      }
    });

    await Promise.resolve();

    expect(values).toEqual([{id: 1}]);
    expect(completed).toBe(true);
    expect(fetchEventSource).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      openWhenHidden: true,
      body: JSON.stringify({bookId: 1})
    }));

    const request = vi.mocked(fetchEventSource).mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      authorization: 'Bearer token',
      accept: EventStreamContentType,
      'content-type': 'application/json'
    });
  });

  it('surfaces response validation failures as observable errors', async () => {
    vi.mocked(fetchEventSource).mockImplementation(async (_url, options) => {
      await options.onopen?.(new Response(null, {
        status: 200,
        headers: {'content-type': 'application/json'}
      }));
    });

    const service = TestBed.inject(SseStreamService);
    const errorPromise = new Promise<Error>((resolve) => {
      service.streamJson('/api/test').subscribe({
        error: (error) => resolve(error as Error)
      });
    });

    await expect(errorPromise).resolves.toMatchObject({
      message: expect.stringContaining(`Expected ${EventStreamContentType}`)
    });
  });

  it('aborts the active request when the subscriber unsubscribes', () => {
    vi.mocked(fetchEventSource).mockImplementation(() => new Promise<void>(() => undefined));

    const service = TestBed.inject(SseStreamService);
    const subscription = service.streamJson('/api/test').subscribe();
    const request = vi.mocked(fetchEventSource).mock.calls[0]?.[1];

    subscription.unsubscribe();

    expect(request).toBeDefined();
    expect(request?.signal?.aborted).toBe(true);
  });
});