import {TestBed} from '@angular/core/testing';
import {HttpClient} from '@angular/common/http';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AuthService} from '../../../shared/service/auth.service';
import {SseStreamService} from '../../../shared/service/sse-stream.service';
import {BookMetadataService} from './book-metadata.service';

describe('BookMetadataService', () => {
  const httpClient = {get: vi.fn(), post: vi.fn()};
  const authService = {getInternalAccessToken: vi.fn()};
  const sseStreamService = {streamJson: vi.fn().mockReturnValue(of({title: 'Test'}))};

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        BookMetadataService,
        {provide: HttpClient, useValue: httpClient},
        {provide: AuthService, useValue: authService},
        {provide: SseStreamService, useValue: sseStreamService}
      ]
    });
  });

  it('throws when no authentication token is available for the metadata stream', () => {
    authService.getInternalAccessToken.mockReturnValue(null);
    const service = TestBed.inject(BookMetadataService);

    expect(() => service.fetchBookMetadata(42, {bookId: 42, providers: ['Google']} as never)).toThrowError('No authentication token available');
  });

  it('posts the metadata lookup request through the SSE bridge', () => {
    authService.getInternalAccessToken.mockReturnValue('token');
    const service = TestBed.inject(BookMetadataService);
    const request = {bookId: 42, providers: ['Google']};

    service.fetchBookMetadata(42, request as never).subscribe();

    expect(sseStreamService.streamJson).toHaveBeenCalledWith('http://localhost:6060/api/v1/books/42/metadata/prospective', {
      method: 'POST',
      headers: {Authorization: 'Bearer token'},
      body: request
    });
  });
});