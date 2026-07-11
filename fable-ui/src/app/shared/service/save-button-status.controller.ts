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

  get disabledForIdle(): boolean {
    return this.status === 'idle' || this.status === 'success';
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

  /** Call when form values change from a user edit. */
  onUserEdit(hasChanges: boolean): void {
    if (hasChanges) {
      this.markDirty();
    } else if (this.status === 'dirty' || this.status === 'error') {
      this.resetIdle();
    }
    // success stays until next dirty edit
  }
}
