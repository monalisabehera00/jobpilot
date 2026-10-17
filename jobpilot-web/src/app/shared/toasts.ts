import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    <div
      class="pointer-events-none fixed inset-x-4 bottom-4 z-1100 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6 sm:left-auto"
      aria-live="polite"
    >
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-4 text-sm shadow-lg ring-1 ring-slate-900/10"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <span
            class="grid size-6 shrink-0 place-items-center rounded-full"
            [class]="
              toast.kind === 'error'
                ? 'bg-rose-100 text-rose-600'
                : 'bg-emerald-100 text-emerald-600'
            "
          >
            <app-icon [name]="toast.kind === 'error' ? 'alert' : 'check'" [size]="14" />
          </span>
          <p class="flex-1 pt-0.5 text-slate-700">{{ toast.text }}</p>
          <button
            type="button"
            class="-m-1 grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss"
            (click)="toastService.dismiss(toast.id)"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-in {
      animation: toast-in 200ms ease-out;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class Toasts {
  protected readonly toastService = inject(ToastService);
}
