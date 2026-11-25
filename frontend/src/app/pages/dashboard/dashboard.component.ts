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
  template: `
    <div class="page-header">
      <div>
        <h1>Operations Dashboard</h1>
        <div class="page-subtitle">Real-time health of Oracle Fusion Cloud scheduled processes, OIC integrations &amp; downstream systems</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" (click)="loadSummary()" [disabled]="loading()">Refresh Metrics</button>
      </div>
    </div>

    <div class="card">
      <form class="filter-bar" (ngSubmit)="loadSummary()">
        <div class="field">
          <label for="dash-module">Module / Process Family</label>
          <select id="dash-module" [(ngModel)]="filters.module" name="module">
            <option value="">All Modules</option>
            @for (m of modules(); track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="dash-from">Date From (UTC)</label>
          <input id="dash-from" type="date" [(ngModel)]="filters.dateFrom" name="dateFrom" />
        </div>
        <div class="field">
          <label for="dash-to">Date To (UTC)</label>
          <input id="dash-to" type="date" [(ngModel)]="filters.dateTo" name="dateTo" />
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Apply Filters</button>
        @if (hasActiveFilters()) {
          <button class="btn btn-secondary btn-sm" type="button" (click)="resetFilters()">Reset All</button>
        }
      </form>

      @if (hasActiveFilters()) {
        <div class="active-filters">
          <span>Active filters:</span>
          @if (filters.module) { <span class="filter-chip">Module: {{ filters.module }}</span> }
          @if (filters.dateFrom) { <span class="filter-chip">From: {{ filters.dateFrom }}</span> }
          @if (filters.dateTo) { <span class="filter-chip">To: {{ filters.dateTo }}</span> }
        </div>
      }
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading() && !summary()) {
      <div class="state-box">Loading operational metrics...</div>
    } @else if (summary(); as s) {
      <div class="kpi-grid">
        <div class="kpi-card kpi-green">
          <div class="kpi-label">Fusion Scheduled Jobs</div>
          <div class="kpi-value">{{ s.fusionTotal }}</div>
          <div class="kpi-sub">
            <span style="color: var(--green); font-weight: 700;">{{ s.fusionSuccess }} Success</span>
            <span style="color: var(--red); font-weight: 700;">{{ s.fusionFailed }} Failed</span>
            <span style="color: var(--blue); font-weight: 700;">{{ s.fusionRunning }} Running</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="s.fusionSuccessRate"></div>
          </div>
          <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Success Rate: <strong>{{ s.fusionSuccessRate }}%</strong></div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">OIC Integration Instances</div>
          <div class="kpi-value">{{ s.oicTotal }}</div>
          <div class="kpi-sub">
            <span style="color: var(--green); font-weight: 700;">{{ s.oicSuccess }} Success</span>
            <span style="color: var(--red); font-weight: 700;">{{ s.oicFailed }} Failed</span>
            <span style="color: var(--blue); font-weight: 700;">{{ s.oicRunning }} Running</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="s.oicSuccessRate"></div>
          </div>
          <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Success Rate: <strong>{{ s.oicSuccessRate }}%</strong></div>
        </div>

        <div class="kpi-card kpi-red">
          <div class="kpi-label">Critical Failures</div>
          <div class="kpi-value" style="color: var(--red);">{{ s.criticalFailures }}</div>
          <div class="kpi-sub">
            <span>Requires immediate operational attention</span>
          </div>
          <div style="margin-top: 10px;">
            <a routerLink="/fusion" class="btn btn-secondary btn-sm">Inspect Fusion</a>
          </div>
        </div>

        <div class="kpi-card kpi-amber">
          <div class="kpi-label">Open Incidents</div>
          <div class="kpi-value" style="color: var(--amber);">{{ s.openIncidents }}</div>
          <div class="kpi-sub">
            <span>Open, Investigating, or Retry Initiated</span>
          </div>
          <div style="margin-top: 10px;">
            <a routerLink="/incidents" class="btn btn-primary btn-sm">Manage Incidents</a>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">
            <span>Recent Failures &amp; Impact</span>
            <a routerLink="/incidents" style="font-size: 12px;">View all incidents &rarr;</a>
          </div>
          @if (s.recentCriticalFailures.length === 0) {
            <div class="state-box">No failures found for the selected filter criteria.</div>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tier</th>
                    <th>Process</th>
                    <th>Module / Target</th>
                    <th>Severity</th>
                    <th>Error</th>
                    <th>Incident</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of s.recentCriticalFailures; track f.executionId) {
                    <tr class="row-failed">
                      <td class="mono">
                        @if (f.sourceType === 'FUSION') {
                          <a [routerLink]="['/fusion', f.executionId]">{{ f.executionId }}</a>
                        } @else {
                          <a [routerLink]="['/oic', f.executionId]">{{ f.executionId }}</a>
                        }
                      </td>
                      <td><span class="badge badge-low">{{ f.sourceType }}</span></td>
                      <td><strong>{{ f.processName }}</strong></td>
                      <td>
                        {{ f.downstreamSystem || f.moduleOrFamily }}
                      </td>
                      <td><span [class]="badgeClass(f.severity)">{{ f.severity }}</span></td>
                      <td style="max-width: 240px;">
                        <span class="mono">{{ f.errorCode }}</span> &mdash; {{ f.errorMessage }}
                      </td>
                      <td>
                        @if (f.incidentId) {
                          <a [routerLink]="['/incidents', f.incidentId]" class="mono">{{ f.incidentId }}</a>
                        } @else {
                          <span style="color: var(--muted);">&mdash;</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <div>
          <div class="card">
            <div class="card-title">Downstream Systems Health</div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Downstream System</th>
                    <th>Criticality</th>
                    <th>Failed / Total</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  @for (sys of s.impactedSystems; track sys.system_id) {
                    <tr>
                      <td>
                        <strong>{{ sys.system_name }}</strong>
                        <div style="font-size: 11px; color: var(--muted);">{{ sys.system_type }}</div>
                      </td>
                      <td><span [class]="badgeClass(sys.criticality)">{{ sys.criticality }}</span></td>
                      <td>{{ sys.failedExecutions }} / {{ sys.totalExecutions }}</td>
                      <td><span [class]="badgeClass(sys.healthStatus)">{{ sys.healthStatus }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Failures by Root-Cause Category</div>
            @if (s.failureByCategory.length === 0) {
              <div class="state-box">No failure categories in current window.</div>
            } @else {
              @for (c of s.failureByCategory; track c.category) {
                <div class="cat-row">
                  <div class="cat-meta">
                    <span>{{ c.category }}</span>
                    <span>{{ c.count }}</span>
                  </div>
                  <div class="progress-track" style="margin-top: 0;">
                    <div class="progress-fill" style="background: var(--red);" [style.width.%]="categoryPct(c.count, s)"></div>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  `
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
