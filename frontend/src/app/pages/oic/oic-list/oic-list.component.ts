import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { OicExecution } from '../../../models/monitoring.models';
import { badgeClass, formatDuration } from '../../../shared/formatters';

@Component({
  selector: 'app-oic-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './oic-list.component.html',
  styleUrl: './oic-list.component.css'
})
export class OicListComponent implements OnInit {
  private readonly api = inject(MonitoringApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<OicExecution[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly sources = ['Fusion ERP', 'Fusion HCM', 'Fusion Procurement', 'Fusion SCM'];
  readonly targets = [
    { id: 'DS01', name: 'Salesforce' },
    { id: 'DS02', name: 'Enterprise Data Warehouse' },
    { id: 'DS03', name: 'Payroll System' },
    { id: 'DS04', name: 'Supplier Portal' },
    { id: 'DS05', name: 'Warehouse Management System' },
    { id: 'DS06', name: 'Banking System' }
  ];

  protected readonly badgeClass = badgeClass;
  protected readonly formatDuration = formatDuration;

  filters = {
    status: '',
    source: '',
    target: '',
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
    this.api.listOicIntegrations(this.filters).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load OIC integration instances.');
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
      status: '', source: '', target: '', severity: '', dateFrom: '', dateTo: '',
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
    window.open(this.api.getOicCsvUrl(this.filters), '_blank');
  }

  hasActiveFilters(): boolean {
    const f = this.filters;
    return Boolean(f.status || f.source || f.target || f.severity || f.dateFrom || f.dateTo || f.search);
  }
}
