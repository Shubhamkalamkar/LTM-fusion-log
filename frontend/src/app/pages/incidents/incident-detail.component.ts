import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { FailureIncident } from '../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../shared/correlation-panel.component';
import { badgeClass } from '../../shared/formatters';

@Component({
  selector: 'app-incident-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, CorrelationPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Incident Detail &amp; Recovery Workflow</h1>
        <div class="page-subtitle"><a routerLink="/incidents">&larr; Back to Incidents List</a></div>
      </div>
      @if (detail(); as d) {
        <div class="header-actions">
          <button
            class="btn btn-danger btn-sm"
            (click)="confirmAndRetry()"
            [disabled]="!canRetry(d) || actionBusy()">
            {{ actionBusy() ? 'Processing...' : 'Simulate Retry (' + d.retry_count + ')' }}
          </button>
        </div>
      }
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box">Loading incident details...</div>
    } @else if (detail(); as d) {
      <div class="card">
        <div class="card-title">
          <span>{{ d.incident_id }} &mdash; {{ d.process_name }}</span>
          <div style="display: flex; gap: 6px;">
            <span [class]="badgeClass(d.severity)">{{ d.severity }}</span>
            <span [class]="badgeClass(d.status)">{{ d.status }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item"><div class="label">Source Tier</div><div class="val">{{ d.source_type }}</div></div>
          <div class="detail-item">
            <div class="label">Source Execution</div>
            <div class="val mono">
              @if (d.source_type === 'FUSION') {
                <a [routerLink]="['/fusion', d.source_execution_id]">{{ d.source_execution_id }}</a>
              } @else {
                <a [routerLink]="['/oic', d.source_execution_id]">{{ d.source_execution_id }}</a>
              }
            </div>
          </div>
          <div class="detail-item"><div class="label">Module / Family</div><div class="val">{{ d.module_or_family }}</div></div>
          <div class="detail-item">
            <div class="label">Downstream Impact</div>
            <div class="val">{{ d.downstream_system_name || 'Internal Fusion ERP' }}</div>
          </div>
          <div class="detail-item"><div class="label">Retry Count</div><div class="val">{{ d.retry_count }}</div></div>
          <div class="detail-item"><div class="label">Last Retry At (UTC)</div><div class="val mono">{{ d.last_retry_at || 'Never' }}</div></div>
          <div class="detail-item"><div class="label">Acknowledged By</div><div class="val">{{ d.acknowledged_by || 'Unassigned' }}</div></div>
          <div class="detail-item"><div class="label">Created At (UTC)</div><div class="val mono">{{ d.created_at }}</div></div>
        </div>

        <div class="error-box" style="margin-top: 14px; margin-bottom: 0;">
          <strong>{{ d.error_code }} [{{ d.error_category }}]:</strong> {{ d.error_message }}
        </div>
      </div>

      <app-correlation-panel [correlation]="d.correlation" />

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Update Incident Status</div>
          <form (ngSubmit)="submitStatusUpdate()" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="field">
              <label for="upd-status">Target Status</label>
              <select id="upd-status" [(ngModel)]="statusForm.status" name="status" required>
                @for (s of statuses; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="upd-by">Engineer / Operator</label>
              <input id="upd-by" type="text" [(ngModel)]="statusForm.performedBy" name="performedBy" />
            </div>
            <div class="field">
              <label for="upd-notes">Resolution / Triage Notes</label>
              <textarea id="upd-notes" rows="2" [(ngModel)]="statusForm.notes" name="notes" placeholder="Document root cause or action taken..."></textarea>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary btn-sm" type="submit" [disabled]="actionBusy()">Update Status</button>
              <button class="btn btn-danger btn-sm" type="button" (click)="confirmAndRetry()" [disabled]="!canRetry(d) || actionBusy()">
                Simulate Retry
              </button>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="card-title">Audit &amp; Retry History</div>
          @if (!d.history || d.history.length === 0) {
            <div class="state-box">No audit history entries recorded.</div>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Action</th>
                    <th>Transition</th>
                    <th>By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of d.history; track h.history_id) {
                    <tr>
                      <td class="mono">{{ h.action_time }}</td>
                      <td><span class="badge badge-low">{{ h.action }}</span></td>
                      <td>
                        <span class="mono">{{ h.old_status || 'NEW' }} &rarr; {{ h.new_status }}</span>
                      </td>
                      <td>{{ h.performed_by }}</td>
                      <td>{{ h.notes }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class IncidentDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(MonitoringApiService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionBusy = signal(false);
  readonly detail = signal<FailureIncident | null>(null);

  readonly statuses = ['Open', 'Investigating', 'Retry Initiated', 'Resolved', 'Closed'];
  protected readonly badgeClass = badgeClass;

  statusForm = {
    status: 'Open',
    performedBy: 'ops-engineer',
    notes: ''
  };

  ngOnInit(): void {
    const incidentId = this.route.snapshot.paramMap.get('incidentId') || '';
    this.loadDetail(incidentId);
  }

  loadDetail(incidentId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getIncident(incidentId).subscribe({
      next: (res) => {
        this.detail.set(res);
        this.statusForm.status = res.status;
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load incident detail.');
        this.loading.set(false);
      }
    });
  }

  canRetry(d: FailureIncident): boolean {
    return d.status !== 'Resolved' && d.status !== 'Closed';
  }

  confirmAndRetry(): void {
    const d = this.detail();
    if (!d || !this.canRetry(d)) return;

    const ok = window.confirm(
      `Simulate retry for ${d.incident_id} (${d.process_name})?\n` +
      `Note: This simulates retry in AWS/MySQL only and does not resubmit a live Oracle job.`
    );
    if (!ok) return;

    this.actionBusy.set(true);
    this.error.set(null);
    this.api.retryIncident(d.incident_id, {
      notes: this.statusForm.notes || 'Simulated retry initiated from Operations Monitor UI',
      performedBy: this.statusForm.performedBy || 'ops-engineer'
    }).subscribe({
      next: (updated) => {
        this.detail.set(updated);
        this.statusForm.status = updated.status;
        this.statusForm.notes = '';
        this.api.showToast(`Retry #${updated.retry_count} simulated for ${updated.incident_id}`, 'success');
        this.actionBusy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Retry simulation failed.');
        this.actionBusy.set(false);
      }
    });
  }

  submitStatusUpdate(): void {
    const d = this.detail();
    if (!d) return;

    this.actionBusy.set(true);
    this.error.set(null);
    this.api.updateIncidentStatus(d.incident_id, {
      status: this.statusForm.status,
      notes: this.statusForm.notes,
      performedBy: this.statusForm.performedBy || 'ops-engineer'
    }).subscribe({
      next: (updated) => {
        this.detail.set(updated);
        this.statusForm.notes = '';
        this.api.showToast(`Incident ${updated.incident_id} updated to ${updated.status}`, 'success');
        this.actionBusy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Status update failed.');
        this.actionBusy.set(false);
      }
    });
  }
}
