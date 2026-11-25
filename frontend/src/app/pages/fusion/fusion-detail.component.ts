import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { FusionExecution } from '../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../shared/correlation-panel.component';
import { badgeClass, formatDuration } from '../../shared/formatters';

@Component({
  selector: 'app-fusion-detail',
  standalone: true,
  imports: [RouterLink, CorrelationPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Fusion Execution Detail</h1>
        <div class="page-subtitle"><a routerLink="/fusion">&larr; Back to Fusion Job Monitor</a></div>
      </div>
      @if (detail()?.incident_id) {
        <a [routerLink]="['/incidents', detail()!.incident_id]" class="btn btn-primary btn-sm">
          Open Incident {{ detail()!.incident_id }}
        </a>
      }
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box">Loading Fusion execution detail...</div>
    } @else if (detail(); as d) {
      <div class="card">
        <div class="card-title">
          <span>{{ d.job_name }} ({{ d.execution_id }})</span>
          <div style="display: flex; gap: 6px;">
            <span [class]="badgeClass(d.status)">{{ d.status }}</span>
            <span [class]="badgeClass(d.severity)">{{ d.severity }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item"><div class="label">Execution ID</div><div class="val mono">{{ d.execution_id }}</div></div>
          <div class="detail-item"><div class="label">ESS Job Definition</div><div class="val mono">{{ d.ess_job_definition || d.job_id }}</div></div>
          <div class="detail-item"><div class="label">Module / Process Family</div><div class="val">{{ d.module }} ({{ d.process_family }})</div></div>
          <div class="detail-item"><div class="label">Start Time (UTC)</div><div class="val mono">{{ d.start_time }}</div></div>
          <div class="detail-item"><div class="label">End Time (UTC)</div><div class="val mono">{{ d.end_time || 'In Progress' }}</div></div>
          <div class="detail-item"><div class="label">Duration</div><div class="val">{{ formatDuration(d.duration_seconds) }}</div></div>
          <div class="detail-item"><div class="label">Correlation ID</div><div class="val mono">{{ d.correlation_id || 'None' }}</div></div>
          <div class="detail-item"><div class="label">Retry Count</div><div class="val">{{ d.retry_count }}</div></div>
        </div>

        @if (d.error_message) {
          <div class="error-box" style="margin-top: 14px; margin-bottom: 0;">
            <strong>{{ d.error_code }} [{{ d.error_category }}]:</strong> {{ d.error_message }}
          </div>
        }
      </div>

      <app-correlation-panel [correlation]="d.correlation" />
    }
  `
})
export class FusionDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(MonitoringApiService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly detail = signal<FusionExecution | null>(null);

  protected readonly badgeClass = badgeClass;
  protected readonly formatDuration = formatDuration;

  ngOnInit(): void {
    const executionId = this.route.snapshot.paramMap.get('executionId') || '';
    this.api.getFusionJob(executionId).subscribe({
      next: (res) => {
        this.detail.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load Fusion execution detail.');
        this.loading.set(false);
      }
    });
  }
}
