import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { OicExecution } from '../../models/monitoring.models';
import { badgeClass, formatDuration } from '../../shared/formatters';

@Component({
  selector: 'app-oic-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>OIC Integration Monitor</h1>
        <div class="page-subtitle">Oracle Integration Cloud instance runs and downstream target-system impact</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" (click)="exportCsv()">Export Filtered CSV</button>
      </div>
    </div>

    <div class="card">
      <form class="filter-bar" (ngSubmit)="applyFilters()">
        <div class="field">
          <label for="oic-status">Status</label>
          <select id="oic-status" [(ngModel)]="filters.status" name="status">
            <option value="">All</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="WARNING">WARNING</option>
          </select>
        </div>
        <div class="field">
          <label for="oic-source">Source System</label>
          <select id="oic-source" [(ngModel)]="filters.source" name="source">
            <option value="">All Sources</option>
            @for (s of sources; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="oic-target">Downstream Target</label>
          <select id="oic-target" [(ngModel)]="filters.target" name="target">
            <option value="">All Targets</option>
            @for (t of targets; track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="oic-sev">Severity</label>
          <select id="oic-sev" [(ngModel)]="filters.severity" name="severity">
            <option value="">All</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="field">
          <label for="oic-from">From Date</label>
          <input id="oic-from" type="date" [(ngModel)]="filters.dateFrom" name="dateFrom" />
        </div>
        <div class="field">
          <label for="oic-to">To Date</label>
          <input id="oic-to" type="date" [(ngModel)]="filters.dateTo" name="dateTo" />
        </div>
        <div class="field grow">
          <label for="oic-search">Integration / Error / ID</label>
          <input id="oic-search" type="text" placeholder="e.g. Payment Integration, OIC2006..." [(ngModel)]="filters.search" name="search" />
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Apply</button>
        @if (hasActiveFilters()) {
          <button class="btn btn-secondary btn-sm" type="button" (click)="resetFilters()">Reset</button>
        }
      </form>

      @if (hasActiveFilters()) {
        <div class="active-filters">
          <span>Applied filters:</span>
          @if (filters.status) { <span class="filter-chip">Status: {{ filters.status }}</span> }
          @if (filters.source) { <span class="filter-chip">Source: {{ filters.source }}</span> }
          @if (filters.target) { <span class="filter-chip">Target: {{ filters.target }}</span> }
          @if (filters.severity) { <span class="filter-chip">Severity: {{ filters.severity }}</span> }
          @if (filters.dateFrom) { <span class="filter-chip">From: {{ filters.dateFrom }}</span> }
          @if (filters.dateTo) { <span class="filter-chip">To: {{ filters.dateTo }}</span> }
          @if (filters.search) { <span class="filter-chip">Search: {{ filters.search }}</span> }
        </div>
      }
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    <div class="card">
      @if (loading()) {
        <div class="state-box">Loading OIC integration instances...</div>
      } @else if (items().length === 0) {
        <div class="state-box">No OIC integration instances matched your filters.</div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" (click)="sortBy('instance_id')">Instance ID</th>
                <th class="sortable" (click)="sortBy('integration_name')">Integration</th>
                <th class="sortable" (click)="sortBy('source_system')">Source</th>
                <th class="sortable" (click)="sortBy('target_system_name')">Downstream Target</th>
                <th class="sortable" (click)="sortBy('start_time')">Start Time (UTC)</th>
                <th class="sortable" (click)="sortBy('status')">Status</th>
                <th class="sortable" (click)="sortBy('severity')">Severity</th>
                <th>Error</th>
                <th>Retries</th>
                <th>Incident</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.instance_id) {
                <tr [class.row-failed]="row.status === 'FAILED'">
                  <td class="mono"><a [routerLink]="['/oic', row.instance_id]">{{ row.instance_id }}</a></td>
                  <td><strong>{{ row.integration_name }}</strong></td>
                  <td>{{ row.source_system }}</td>
                  <td>
                    <span [class]="row.status === 'FAILED' ? badgeClass(row.target_criticality) : 'badge badge-low'">
                      {{ row.target_system_name }}
                    </span>
                    @if (row.status === 'FAILED') {
                      <div style="font-size: 11px; color: var(--red); font-weight: 600;">Downstream Impacted</div>
                    }
                  </td>
                  <td class="mono">{{ row.start_time }}</td>
                  <td><span [class]="badgeClass(row.status)">{{ row.status }}</span></td>
                  <td><span [class]="badgeClass(row.severity)">{{ row.severity }}</span></td>
                  <td style="max-width: 240px;">
                    @if (row.error_message) {
                      <span class="mono">{{ row.error_code }}</span> &mdash; {{ row.error_message }}
                    } @else {
                      <span style="color: var(--muted);">&mdash;</span>
                    }
                  </td>
                  <td>{{ row.retry_count }}</td>
                  <td>
                    @if (row.incident_id) {
                      <a [routerLink]="['/incidents', row.incident_id]" class="mono">{{ row.incident_id }}</a>
                    } @else {
                      <span style="color: var(--muted);">&mdash;</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <div>Showing {{ items().length }} of {{ total() }} instances (Page {{ filters.page }} of {{ totalPages() }})</div>
          <div class="pagination-controls">
            <button class="btn btn-secondary btn-sm" (click)="goToPage(filters.page - 1)" [disabled]="filters.page <= 1">Previous</button>
            <button class="btn btn-secondary btn-sm" (click)="goToPage(filters.page + 1)" [disabled]="filters.page >= totalPages()">Next</button>
          </div>
        </div>
      }
    </div>
  `
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
