import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { FusionExecution } from '../../../models/monitoring.models';
import { badgeClass, formatDuration } from '../../../shared/formatters';

@Component({
  selector: 'app-fusion-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './fusion-list.component.html',
  styleUrl: './fusion-list.component.css'
})
export class FusionListComponent implements OnInit {
  private readonly api = inject(MonitoringApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<FusionExecution[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly modules = ['Payables', 'General Ledger', 'Receivables', 'Procurement', 'Supply Chain', 'HCM', 'Payments'];
  protected readonly badgeClass = badgeClass;
  protected readonly formatDuration = formatDuration;

  filters = {
    status: '',
    module: '',
    severity: '',
    dateFrom: '',
    dateTo: '',
    search: '',
    sortBy: 'start_time',
    sortOrder: 'desc',
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
    this.api.listFusionJobs(this.filters).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load Fusion job executions.');
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadList();
  }

  resetFilters(): void {
    this.filters = {
      status: '', module: '', severity: '', dateFrom: '', dateTo: '',
      search: '', sortBy: 'start_time', sortOrder: 'desc', page: 1, limit: 15
    };
    this.loadList();
  }

  sortBy(col: string): void {
    if (this.filters.sortBy === col) {
      this.filters.sortOrder = this.filters.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      this.filters.sortBy = col;
      this.filters.sortOrder = 'desc';
    }
    this.loadList();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.filters.page = p;
    this.loadList();
  }

  exportCsv(): void {
    window.open(this.api.getFusionCsvUrl(this.filters), '_blank');
  }

  hasActiveFilters(): boolean {
    const f = this.filters;
    return Boolean(f.status || f.module || f.severity || f.dateFrom || f.dateTo || f.search);
  }
}
