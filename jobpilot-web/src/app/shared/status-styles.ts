import { ApplicationStatus } from '../core/models';

export const STATUS_STYLES: Record<
  ApplicationStatus,
  { badge: string; dot: string; accent: string }
> = {
  Wishlist: {
    badge: 'bg-slate-100 text-slate-700 ring-slate-500/15',
    dot: 'bg-slate-400',
    accent: 'border-t-slate-400',
  },
  Applied: {
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    dot: 'bg-blue-500',
    accent: 'border-t-blue-500',
  },
  Interview: {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
    accent: 'border-t-amber-500',
  },
  Offer: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
    accent: 'border-t-emerald-500',
  },
  Rejected: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/15',
    dot: 'bg-rose-500',
    accent: 'border-t-rose-500',
  },
};
