import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon, IconName } from '../../shared/icon';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon],
  template: `
    <header class="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <a routerLink="/board" class="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span
            class="grid size-9 place-items-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"
          >
            <app-icon name="briefcase" [size]="18" />
          </span>
          <span class="hidden sm:inline">JobPilot</span>
        </a>

        <nav class="flex items-center gap-1" aria-label="Main">
          @for (link of links; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="!bg-indigo-50 !text-indigo-700"
              #rla="routerLinkActive"
              [attr.aria-current]="rla.isActive ? 'page' : null"
              class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <app-icon [name]="link.icon" [size]="16" />
              <span class="hidden sm:inline">{{ link.label }}</span>
            </a>
          }
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <div class="hidden text-right md:block">
            <p class="text-sm leading-tight font-semibold text-slate-800">
              {{ auth.user()?.name }}
            </p>
            <p class="text-xs leading-tight text-slate-500">{{ auth.user()?.email }}</p>
          </div>
          <span
            class="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 ring-2 ring-white"
            aria-hidden="true"
            >{{ initials() }}</span
          >
          <button
            type="button"
            class="icon-btn"
            title="Log out"
            aria-label="Log out"
            (click)="auth.logout()"
          >
            <app-icon name="logout" [size]="18" />
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly links: { path: string; label: string; icon: IconName }[] = [
    { path: '/board', label: 'Board', icon: 'board' },
    { path: '/applications', label: 'Applications', icon: 'list' },
    { path: '/resumes', label: 'Resumes', icon: 'file' },
  ];

  protected readonly initials = computed(() =>
    (this.auth.user()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
}
