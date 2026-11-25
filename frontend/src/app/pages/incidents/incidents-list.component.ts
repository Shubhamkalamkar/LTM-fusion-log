import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { FailureIncident } from '../../models/monitoring.models';
import { badgeClass } from '../../shared/formatters';

@Component({
  selector: 'app-incidents-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Failure Incidents &amp; Correlation</h1>
        <div class="page-subtitle">Triage, acknowledge, inspect cross-tier business impact, and simulate retries</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" (click)="exportCsv()">Export Filtered CSV</button>
      </div>
    </div>

    <div class="card">
      <form class="filter-bar" (ngSubmit)="applyFilters()">
        <div class="field">
          <label for="inc-status">Incident Status</label>
          <select id="inc-status" [(ngModel)]="filters.status" name="status">
            <option value="">All Statuses</option>
            @for (s of statuses; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="inc-sev">Severity</label>
          <select id="inc-sev" [(ngModel)]="filters.severity" name="severity">
            <option value="">All</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="field">
          <label for="inc-source">Source Tier</label>
          <select id="inc-source" [(ngModel)]="filters.sourceType" name="sourceType">
            <option value="">All</option>
            <option value="FUSION">Fusion Cloud</option>
            <option value="OIC">OIC</option>
          </select>
        </div>
        <div class="field grow">
          <label for="inc-search">Search Incident / Process / Error</label>
          <input id="inc-search" type="text" placeholder="e.g. INC004, Payment Integration, WMS..." [(ngModel)]="filters.search" name="search" />
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Apply</button>
        @if (hasActiveFilters()) {
          <button class="btn btn-secondary btn-sm" type="button" (click)="resetFilters()">Reset</button>
        }
      </form>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    <div class="card">
      @if (loading()) {
        <div class="state-box">Loading failure incidents...</div>
      } @else if (items().length === 0) {
        <div class="state-box">No incidents matched your filter criteria.</div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Source</th>
                <th>Process</th>
                <th>Downstream Impact</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Created (UTC)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (inc of items(); track inc.incident_id) {
                <tr [class.row-failed]="inc.status === 'Open'">
                  <td class="mono"><a [routerLink]="['/incidents', inc.incident_id]">{{ inc.incident_id }}</a></td>
                  <td>
                    <span class="badge badge-low">{{ inc.source_type }}</span>
                    <span class="mono" style="margin-left: 4px;">{{ inc.source_execution_id }}</span>
                  </td>
                  <td>
                    <strong>{{ inc.process_name }}</strong>
                    <div style="font-size: 11px; color: var(--muted);">{{ inc.module_or_family }}</div>
                  </td>
                  <td>
                    @if (inc.downstream_system_name) {
                      <span [class]="badgeClass(inc.downstream_criticality)">{{ inc.downstream_system_name }}</span>
                    } @else {
                      <span style="color: var(--muted);">Internal ERP</span>
                    }
                  </td>
                  <td><span [class]="badgeClass(inc.severity)">{{ inc.severity }}</span></td>
                  <td><span [class]="badgeClass(inc.status)">{{ inc.status }}</span></td>
                  <td>{{ inc.retry_count }}</td>
                  <td class="mono">{{ inc.created_at }}</td>
                  <td>
                    <a [routerLink]="['/incidents', inc.incident_id]" class="btn btn-secondary btn-sm">Inspect</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <div>Showing {{ items().length }} of {{ total() }} incidents (Page {{ filters.page }} of {{ totalPages() }})</div>
          <div class="pagination-controls">
            <button class="btn btn-secondary btn-sm" (click)="goToPage(filters.page - 1)" [disabled]="filters.page <= 1">Previous</button>
            <button class="btn btn-secondary btn-sm" (click)="goToPage(filters.page + 1)" [disabled]="filters.page >= totalPages()">Next</button>
          </div>
        </div>
      }
    </div>
  `
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
