import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringApiService } from '../../../services/monitoring-api.service';
import { FusionExecution } from '../../../models/monitoring.models';
import { CorrelationPanelComponent } from '../../../shared/correlation-panel.component';
import { badgeClass, formatDuration } from '../../../shared/formatters';

@Component({
  selector: 'app-fusion-detail',
  standalone: true,
  imports: [RouterLink, CorrelationPanelComponent],
  templateUrl: './fusion-detail.component.html',
  styleUrl: './fusion-detail.component.css'
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
