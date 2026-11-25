import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { DashboardSummary } from '../../models/monitoring.models';
import { badgeClass } from '../../shared/formatters';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(MonitoringApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly modules = signal<string[]>([
    'Payables', 'General Ledger', 'Receivables', 'Procurement', 'Supply Chain', 'HCM', 'Payments'
  ]);

  filters = { module: '', dateFrom: '', dateTo: '' };
  protected readonly badgeClass = badgeClass;

  ngOnInit(): void {
    this.loadSummary();
    this.api.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadSummary());
  }

  loadSummary(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getDashboardSummary(this.filters).subscribe({
      next: (data) => {
        this.summary.set(data);
        if (data.availableModules?.length) {
          this.modules.set(data.availableModules);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Unable to load dashboard metrics.');
        this.loading.set(false);
      }
    });
  }

  resetFilters(): void {
    this.filters = { module: '', dateFrom: '', dateTo: '' };
    this.loadSummary();
  }

  hasActiveFilters(): boolean {
    return Boolean(this.filters.module || this.filters.dateFrom || this.filters.dateTo);
  }

  categoryPct(count: number, s: DashboardSummary): number {
    const totalFailures = Math.max(1, s.fusionFailed + s.oicFailed);
    return Math.min(100, Math.round((count / totalFailures) * 100));
  }
}
