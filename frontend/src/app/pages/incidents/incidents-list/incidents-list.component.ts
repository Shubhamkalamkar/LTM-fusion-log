import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { FailureIncident } from '../../../models/monitoring.models';
import { badgeClass } from '../../../shared/formatters';

@Component({
  selector: 'app-incidents-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './incidents-list.component.html',
  styleUrl: './incidents-list.component.css'
})
export class IncidentsListComponent implements OnInit {
  private readonly api = inject(MonitoringApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<FailureIncident[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly statuses = ['Open', 'Investigating', 'Retry Initiated', 'Resolved', 'Closed'];
  protected readonly badgeClass = badgeClass;

  filters = {
    status: '',
    severity: '',
    sourceType: '',
    search: '',
    page: 1,
    limit: 15
  };

  ngOnInit(): void {
    this.loadList();
    this.api.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadList());
  }

  loadList(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listIncidents(this.filters).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load incidents.');
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadList();
  }

  resetFilters(): void {
    this.filters = { status: '', severity: '', sourceType: '', search: '', page: 1, limit: 15 };
    this.loadList();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.filters.page = p;
    this.loadList();
  }

  exportCsv(): void {
    window.open(this.api.getIncidentsCsvUrl(this.filters), '_blank');
  }

  hasActiveFilters(): boolean {
    const f = this.filters;
    return Boolean(f.status || f.severity || f.sourceType || f.search);
  }
}
