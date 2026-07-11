import {Injectable} from '@angular/core';

export type SaveButtonStatus = 'idle' | 'dirty' | 'success' | 'error';

/**
 * Grey idle / orange dirty / green success / red error.
 * Outcome colors persist until the next user-initiated change.
 */
@Injectable()
export class SaveButtonStatusController {
  private status: SaveButtonStatus = 'idle';

  get value(): SaveButtonStatus {
    return this.status;
  }

  /** PrimeNG p-button severity */
  get severity(): 'secondary' | 'warn' | 'success' | 'danger' {
    switch (this.status) {
      case 'dirty':
        return 'warn';
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  /** Prefer dirty (warn) over last outcome color. */
  severityFor(dirty: boolean): 'secondary' | 'warn' | 'success' | 'danger' {
    if (dirty || this.status === 'dirty') {
      return 'warn';
    }
    return this.severity;
  }

  get disabledForIdle(): boolean {
    return this.status === 'idle' || this.status === 'success';
  }

  /** Disable when clean (idle/success), allow retry after error. */
  disabledWhenClean(dirty: boolean, isSaving = false): boolean {
    return isSaving || (!dirty && this.status !== 'error' && this.status !== 'dirty');
  }

  markDirty(): void {
    this.status = 'dirty';
  }

  markSuccess(): void {
    this.status = 'success';
  }

  markError(): void {
    this.status = 'error';
  }

  resetIdle(): void {
    this.status = 'idle';
  }

  /**
   * Call when form values change from a user edit.
   * Only promotes to dirty — never clears outcome/dirty from a false "clean" pulse
   * (spurious valueChanges after enable/disable can report dirty=false briefly).
   */
  onUserEdit(hasChanges: boolean): void {
    if (hasChanges) {
      this.markDirty();
    }
  }
}
