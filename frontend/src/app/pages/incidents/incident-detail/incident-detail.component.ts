import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { FailureIncident } from '../../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../../shared/correlation-panel.component';
import { badgeClass } from '../../../shared/formatters';

@Component({
  selector: 'app-incident-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, CorrelationPanelComponent],
  templateUrl: './incident-detail.component.html',
  styleUrl: './incident-detail.component.css'
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
