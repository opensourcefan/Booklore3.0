import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {BookDialogHelperService} from './book-dialog-helper.service';
import {DialogLauncherService, DialogSize, DialogStyle} from '../../../../shared/services/dialog-launcher.service';
import {MetadataRefreshType} from '../../../metadata/model/request/metadata-refresh-type.enum';

describe('BookDialogHelperService', () => {
  let openDialogMock: ReturnType<typeof vi.fn>;
  let service: BookDialogHelperService;

  beforeEach(() => {
    openDialogMock = vi.fn().mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        BookDialogHelperService,
        {
          provide: DialogLauncherService,
          useValue: {
            openDialog: openDialogMock,
          },
        },
      ],
    });

    service = TestBed.inject(BookDialogHelperService);
  });

  it('opens the metadata refresh dialog with the targeted width class', () => {
    service.openMetadataRefreshDialog(new Set([11, 22]));

    expect(openDialogMock).toHaveBeenCalledOnce();
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        showHeader: false,
        styleClass: `metadata-refresh-dialog ${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        data: {
          bookIds: [11, 22],
          metadataRefreshType: MetadataRefreshType.BOOKS,
        },
      }),
    );
  });
});