import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {EventStreamContentType, fetchEventSource} from '@microsoft/fetch-event-source';

export interface SseStreamRequest {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class SseStreamService {
  streamJson<T>(url: string, request: SseStreamRequest = {}): Observable<T> {
    return new Observable<T>((subscriber) => {
      const abortController = new AbortController();
      const headerBag = new Headers(request.headers);
      let finished = false;
      let aborted = false;

      if (!headerBag.has('Accept')) {
        headerBag.set('Accept', EventStreamContentType);
      }

      if (request.body !== undefined && !headerBag.has('Content-Type')) {
        headerBag.set('Content-Type', 'application/json');
      }

      const headers: Record<string, string> = {};
      headerBag.forEach((value, key) => {
        headers[key] = value;
      });

      const finishWithError = (error: unknown) => {
        if (finished || subscriber.closed) {
          return;
        }

        finished = true;
        subscriber.error(this.toError(error));

        if (!aborted) {
          aborted = true;
          abortController.abort();
        }
      };

      const finishSuccessfully = () => {
        if (finished || subscriber.closed) {
          return;
        }

        finished = true;
        subscriber.complete();
      };

      void fetchEventSource(url, {
        method: request.method ?? 'GET',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        credentials: 'include',
        openWhenHidden: true,
        signal: abortController.signal,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`SSE request failed with status ${response.status}`);
          }

          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes(EventStreamContentType)) {
            throw new Error(`Expected ${EventStreamContentType} but received ${contentType ?? 'unknown content type'}`);
          }
        },
        onmessage: (event) => {
          if (finished || subscriber.closed || !event.data) {
            return;
          }

          try {
            subscriber.next(JSON.parse(event.data) as T);
          } catch (error) {
            finishWithError(error);
          }
        },
        onclose: () => {
          finishSuccessfully();
        },
        onerror: (error) => {
          finishWithError(error);
          throw error;
        }
      }).catch((error) => {
        if (aborted || finished) {
          return;
        }

        finishWithError(error);
      });

      return () => {
        if (aborted) {
          return;
        }

        aborted = true;
        abortController.abort();
      };
    });
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(typeof error === 'string' ? error : 'SSE stream request failed');
  }
}