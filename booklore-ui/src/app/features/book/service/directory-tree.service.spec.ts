import {HttpClient} from '@angular/common/http';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {DirectoryRootNode, DirectoryTreeService} from './directory-tree.service';

describe('DirectoryTreeService', () => {
  let service: DirectoryTreeService;
  let httpGetSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGetSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        DirectoryTreeService,
        {provide: HttpClient, useValue: {get: httpGetSpy}},
      ]
    });

    service = TestBed.inject(DirectoryTreeService);
  });

  it('sorts root folders by visible folder name and child folders alphabetically', async () => {
    const tree: DirectoryRootNode[] = [
      {
        libraryId: 1,
        libraryName: 'Library B',
        libraryPathId: 20,
        rootPath: '/bbb/Zebra',
        hasRootBooks: true,
        children: [
          {name: 'gamma', path: 'gamma'},
          {name: 'Alpha', path: 'Alpha'},
        ],
      },
      {
        libraryId: 1,
        libraryName: 'Library A',
        libraryPathId: 10,
        rootPath: '/zzz/alpha',
        hasRootBooks: true,
        children: [
          {name: 'delta', path: 'delta'},
          {name: 'Beta', path: 'Beta'},
        ],
      },
      {
        libraryId: 1,
        libraryName: 'Library C',
        libraryPathId: 30,
        rootPath: '/aaa/Beta',
        hasRootBooks: true,
        children: [],
      },
    ];

    httpGetSpy.mockReturnValue(of(tree));

    const result = await new Promise<DirectoryRootNode[]>((resolve, reject) => {
      service.getAllLibrariesTree().subscribe({
        next: resolve,
        error: reject,
      });
    });

    expect(result.map(node => node.rootPath)).toEqual([
      '/zzz/alpha',
      '/aaa/Beta',
      '/bbb/Zebra',
    ]);
    expect(result[0].children?.map(node => node.name)).toEqual(['Beta', 'delta']);
    expect(result[2].children?.map(node => node.name)).toEqual(['Alpha', 'gamma']);
  });
});