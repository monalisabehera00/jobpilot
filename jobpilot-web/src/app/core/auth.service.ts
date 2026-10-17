import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, User } from './models';

const STORAGE_KEY = 'jobpilot.session';

interface Session {
  token: string;
  user: User;
}

// Reads the JWT "exp" claim so an expired token is dropped before it is ever sent
function isExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1] ?? '';
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof exp === 'number' && exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function readStoredSession(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return session?.token && !isExpired(session.token) ? session : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);

  isAuthenticated(): boolean {
    const session = this.session();
    if (session && isExpired(session.token)) {
      this.clear();
      return false;
    }
    return session !== null;
  }

  async login(email: string, password: string): Promise<void> {
    this.store(
      await firstValueFrom(this.http.post<AuthResponse>('/api/auth/login', { email, password })),
    );
  }

  async register(name: string, email: string, password: string): Promise<void> {
    this.store(
      await firstValueFrom(
        this.http.post<AuthResponse>('/api/auth/register', { name, email, password }),
      ),
    );
  }

  logout(reason?: 'expired'): void {
    this.clear();
    void this.router.navigate(['/login'], { queryParams: reason ? { reason } : {} });
  }

  private store(session: Session): void {
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage can be unavailable (e.g. private mode); the session still works until reload
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored to remove
    }
  }
}
