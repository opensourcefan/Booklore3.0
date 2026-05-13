import {TestBed} from '@angular/core/testing';
import {HttpClient} from '@angular/common/http';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AuthService} from '../../../shared/service/auth.service';
import {SseStreamService} from '../../../shared/service/sse-stream.service';
import {AuthorService} from './author.service';

describe('AuthorService autoMatchAuthors', () => {
  const httpClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  };
  const authService = {getInternalAccessToken: vi.fn()};
  const sseStreamService = {streamJson: vi.fn().mockReturnValue(of({id: 7}))};

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AuthorService,
        {provide: HttpClient, useValue: httpClient},
        {provide: AuthService, useValue: authService},
        {provide: SseStreamService, useValue: sseStreamService}
      ]
    });
  });

  it('posts selected author ids through the SSE bridge', () => {
    authService.getInternalAccessToken.mockReturnValue('token');
    const service = TestBed.inject(AuthorService);

    service.autoMatchAuthors([7, 8]).subscribe();

    expect(sseStreamService.streamJson).toHaveBeenCalledWith('http://localhost:6060/api/v1/authors/auto-match', {
      method: 'POST',
      headers: {Authorization: 'Bearer token'},
      body: [7, 8]
    });
  });
});