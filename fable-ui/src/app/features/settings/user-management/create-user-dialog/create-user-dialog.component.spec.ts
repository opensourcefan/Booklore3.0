import {Clipboard} from '@angular/cdk/clipboard';
import {MessageService} from 'primeng/api';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CreateUserDialogComponent} from './create-user-dialog.component';

describe('CreateUserDialogComponent copyCredentialsPack', () => {
  let component: CreateUserDialogComponent;
  let clipboardCopy: ReturnType<typeof vi.fn>;
  let messageAdd: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clipboardCopy = vi.fn().mockReturnValue(true);
    messageAdd = vi.fn();
    toastError = vi.fn();

    component = Object.create(CreateUserDialogComponent.prototype) as CreateUserDialogComponent;
    (component as unknown as {clipboard: Clipboard}).clipboard = {copy: clipboardCopy} as unknown as Clipboard;
    (component as unknown as {messageService: MessageService}).messageService = {
      add: messageAdd,
    } as unknown as MessageService;
    (component as unknown as {t: {translate: (k: string) => string}}).t = {
      translate: (key: string) => key,
    };
    (component as unknown as {toastError: typeof toastError}).toastError = toastError;
    (component as unknown as {ref: DynamicDialogRef}).ref = {} as DynamicDialogRef;
    component.credentialsPackText = 'Fable login\nUsername: test123\nPassword: secret';
  });

  it('copies via CDK clipboard and shows success', () => {
    component.copyCredentialsPack();

    expect(clipboardCopy).toHaveBeenCalledWith(component.credentialsPackText);
    expect(messageAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'success',
      detail: 'settingsUsers.createDialog.credentialsCopied',
    }));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('selects the textarea and toasts when clipboard copy fails', () => {
    clipboardCopy.mockReturnValue(false);
    const focus = vi.fn();
    const select = vi.fn();
    const textarea = {focus, select} as unknown as HTMLTextAreaElement;
    const getElementById = vi.spyOn(document, 'getElementById').mockReturnValue(textarea);

    component.copyCredentialsPack();

    expect(getElementById).toHaveBeenCalledWith('created-credentials-pack');
    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'common.error',
      'settingsUsers.createDialog.credentialsCopyFailed'
    );
    expect(messageAdd).not.toHaveBeenCalled();

    getElementById.mockRestore();
  });
});
