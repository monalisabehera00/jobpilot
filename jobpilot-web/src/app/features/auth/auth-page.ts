import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

// Serves both /login and /register; the route's data.mode decides which
@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './auth-page.html',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly isRegister = this.route.snapshot.data['mode'] === 'register';
  protected readonly sessionExpired = this.route.snapshot.queryParamMap.get('reason') === 'expired';
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly features = [
    {
      icon: 'board',
      title: 'A board for every application',
      text: 'Drag cards from Wishlist to Offer and see your whole search at a glance.',
    },
    {
      icon: 'sparkles',
      title: 'AI resume match',
      text: 'Score your resume against any job description and see exactly what to add.',
    },
    {
      icon: 'bell',
      title: 'Never miss a follow-up',
      text: 'Get an email when it is time to check in with a recruiter.',
    },
  ] as const;

  // Decorative board preview on the login screen
  protected readonly previewColumns = [
    { label: 'Applied', dot: 'bg-blue-400', cards: [1, 2] },
    { label: 'Interview', dot: 'bg-amber-400', cards: [1] },
    { label: 'Offer', dot: 'bg-emerald-400', cards: [1] },
  ];

  protected readonly form = this.fb.group({
    name: ['', this.isRegister ? [Validators.required, Validators.maxLength(100)] : []],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(this.isRegister ? 8 : 1)]],
  });

  protected showError(field: 'name' | 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    try {
      if (this.isRegister) {
        await this.auth.register(name, email, password);
      } else {
        await this.auth.login(email, password);
      }
      await this.router.navigateByUrl('/board');
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
