import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {BookDialogHelperService} from './book-dialog-helper.service';
import {DialogLauncherService, DialogSize, DialogStyle} from '../../../../shared/services/dialog-launcher.service';
import {MetadataRefreshType} from '../../../metadata/model/request/metadata-refresh-type.enum';

describe('BookDialogHelperService', () => {
  let openDialogMock: ReturnType<typeof vi.fn>;
  let getScrollablePickerDialogStyleMock: ReturnType<typeof vi.fn>;
  let service: BookDialogHelperService;

  beforeEach(() => {
    openDialogMock = vi.fn().mockReturnValue(null);
    getScrollablePickerDialogStyleMock = vi.fn((desktopSize = DialogSize.SM) => {
      const map: Record<string, string> = {
        [DialogSize.SM]: 'picker-sm',
        [DialogSize.MD]: 'picker-md',
        [DialogSize.LG]: 'picker-lg',
        [DialogSize.XL]: 'picker-xl',
      };
      return `${map[desktopSize] ?? 'picker-sm'} ${DialogStyle.MINIMAL}`;
    });

    TestBed.configureTestingModule({
      providers: [
        BookDialogHelperService,
        {
          provide: DialogLauncherService,
          useValue: {
            openDialog: openDialogMock,
            getScrollablePickerDialogStyle: getScrollablePickerDialogStyleMock,
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

  it('opens book type assigner with scrollable picker style', () => {
    service.openBookTypeAssignerDialog({id: 1} as never, null);

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith();
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-sm ${DialogStyle.MINIMAL}`,
      }),
    );
  });

  it('opens media type manager with large scrollable picker style', () => {
    service.openMediaTypeManagerDialog();

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith(DialogSize.LG);
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-lg ${DialogStyle.MINIMAL}`,
      }),
    );
  });

  it('opens story arc assigner with scrollable picker style', () => {
    service.openStoryArcAssignerDialog(new Set([1, 2]));

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith();
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-sm ${DialogStyle.MINIMAL}`,
      }),
    );
  });

  it('opens lock/unlock metadata with large scrollable picker style', () => {
    service.openLockUnlockMetadataDialog(new Set([3, 4]));

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith(DialogSize.LG);
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-lg ${DialogStyle.MINIMAL}`,
        data: {bookIds: [3, 4]},
      }),
    );
  });

  it('opens bulk metadata update with XL scrollable picker style', () => {
    service.openBulkMetadataEditDialog(new Set([5]));

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith(DialogSize.XL);
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-xl ${DialogStyle.MINIMAL}`,
      }),
    );
  });

  it('opens book file attacher with MD scrollable picker style', () => {
    service.openBookFileAttacherDialog({id: 9} as never);

    expect(getScrollablePickerDialogStyleMock).toHaveBeenCalledWith(DialogSize.MD);
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        styleClass: `picker-md ${DialogStyle.MINIMAL}`,
      }),
    );
  });
});
