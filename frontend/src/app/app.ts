import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MonitoringApiService } from './services/monitoring-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly simulating = signal(false);

  constructor(readonly api: MonitoringApiService) { }

  simulateFailure(): void {
    this.simulating.set(true);
    this.api.simulateEvent({ forceFailure: true }).subscribe({
      next: (res) => {
        const id = res.execution.execution_id || res.execution.instance_id;
        let msg = `Simulated ${res.sourceType} execution ${id} (${res.execution.status})`;
        if (res.incident) {
          msg += ` -> Created Incident ${res.incident.incident_id} [${res.incident.severity}]`;
        }
        this.api.showToast(msg, res.execution.status === 'FAILED' ? 'error' : 'success');
        this.api.triggerRefresh();
        this.simulating.set(false);
      },
      error: (err) => {
        this.api.showToast(err?.error?.message || 'Failed to simulate event', 'error');
        this.simulating.set(false);
      }
    });
  }
}
