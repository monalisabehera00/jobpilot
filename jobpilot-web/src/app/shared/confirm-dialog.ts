import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Icon } from './icon';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [Icon],
  template: `
    <div class="dialog-panel max-w-md">
      <div class="flex gap-4">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600"
        >
          <app-icon name="alert" [size]="20" />
        </span>
        <div>
          <h2 class="text-lg font-semibold text-slate-900">{{ data.title }}</h2>
          <p class="mt-1 text-sm text-slate-500">{{ data.message }}</p>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-secondary" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn-danger" (click)="ref.close(true)">
          {{ data.confirmText ?? 'Delete' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean>(ConfirmDialog, {
      data: options,
      role: 'alertdialog',
      ariaLabel: options.title,
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
