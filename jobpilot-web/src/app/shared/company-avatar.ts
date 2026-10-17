import { Component, computed, input } from '@angular/core';

const PALETTE = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
];

// A colored initial for a company; the same name always gets the same color
@Component({
  selector: 'app-company-avatar',
  host: { 'aria-hidden': 'true', class: 'inline-flex shrink-0' },
  template: ` <span [class]="classes()">{{ initial() }}</span> `,
})
export class CompanyAvatar {
  readonly name = input.required<string>();
  readonly size = input<'md' | 'lg'>('md');

  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '?');
  protected readonly classes = computed(() => {
    let hash = 0;
    for (const char of this.name().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const shape =
      this.size() === 'lg' ? 'size-11 rounded-xl text-base' : 'size-9 rounded-lg text-sm';
    return `grid place-items-center font-bold ${shape} ${PALETTE[hash % PALETTE.length]}`;
  });
}
