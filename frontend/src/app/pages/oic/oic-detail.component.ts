import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../services/monitoring-api.service';
import { OicExecution } from '../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../shared/correlation-panel.component';
import { badgeClass, formatDuration } from '../../shared/formatters';

@Component({
  selector: 'app-oic-detail',
  standalone: true,
  imports: [RouterLink, CorrelationPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>OIC Integration Instance Detail</h1>
        <div class="page-subtitle"><a routerLink="/oic">&larr; Back to OIC Integration Monitor</a></div>
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
      <div class="state-box">Loading OIC integration instance...</div>
    } @else if (detail(); as d) {
      <div class="card">
        <div class="card-title">
          <span>{{ d.integration_name }} ({{ d.instance_id }})</span>
          <div style="display: flex; gap: 6px;">
            <span [class]="badgeClass(d.status)">{{ d.status }}</span>
            <span [class]="badgeClass(d.severity)">{{ d.severity }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item"><div class="label">Instance ID</div><div class="val mono">{{ d.instance_id }}</div></div>
          <div class="detail-item"><div class="label">Integration Code</div><div class="val mono">{{ d.integration_code || d.integration_id }}</div></div>
          <div class="detail-item"><div class="label">Source System</div><div class="val">{{ d.source_system }}</div></div>
          <div class="detail-item">
            <div class="label">Downstream Target</div>
            <div class="val">
              {{ d.target_system_name }}
              <span [class]="badgeClass(d.target_criticality)">{{ d.target_criticality }}</span>
            </div>
          </div>
          <div class="detail-item"><div class="label">Start Time (UTC)</div><div class="val mono">{{ d.start_time }}</div></div>
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
export class OicDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(MonitoringApiService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly detail = signal<OicExecution | null>(null);

  protected readonly badgeClass = badgeClass;
  protected readonly formatDuration = formatDuration;

  ngOnInit(): void {
    const instanceId = this.route.snapshot.paramMap.get('instanceId') || '';
    this.api.getOicIntegration(instanceId).subscribe({
      next: (res) => {
        this.detail.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load OIC instance detail.');
        this.loading.set(false);
      }
    });
  }
}
