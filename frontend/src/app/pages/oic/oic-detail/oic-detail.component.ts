import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { OicExecution } from '../../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../../shared/correlation-panel.component';
import { badgeClass, formatDuration } from '../../../shared/formatters';

@Component({
  selector: 'app-oic-detail',
  standalone: true,
  imports: [RouterLink, CorrelationPanelComponent],
  templateUrl: './oic-detail.component.html',
  styleUrl: './oic-detail.component.css'
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
