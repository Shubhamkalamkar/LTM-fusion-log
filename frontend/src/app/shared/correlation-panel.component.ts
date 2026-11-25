import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CorrelationContext } from '../models/monitoring.models';
import { badgeClass } from './formatters';

@Component({
  selector: 'app-correlation-panel',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (correlation) {
      <div class="card">
        <div class="card-title">
          <span>End-to-End Business Transaction Correlation</span>
          <span [class]="correlation.isExactMatch ? 'badge badge-critical' : 'badge badge-warning'">
            {{ correlation.relationshipType }}
          </span>
        </div>

        <div class="corr-box">
          <div style="font-size: 13px; margin-bottom: 10px;">
            <strong>Correlation ID:</strong>
            <span class="mono">{{ correlation.correlationId || 'None (matched via process family & ±' + correlation.timeWindowMinutes + ' min window)' }}</span>
          </div>

          <div class="corr-chain">
            @for (f of correlation.fusionExecutions; track f.execution_id) {
              <div class="corr-node" [class.node-failed]="f.status === 'FAILED'" [class.node-success]="f.status === 'SUCCESS'">
                <div style="font-size: 11px; color: var(--muted); font-weight: 700;">ORACLE FUSION JOB</div>
                <div style="font-weight: 700; margin: 2px 0;">
                  <a [routerLink]="['/fusion', f.execution_id]">{{ f.execution_id }}</a> &bull; {{ f.job_name }}
                </div>
                <div style="font-size: 12px; display: flex; gap: 6px; align-items: center;">
                  <span [class]="badgeClass(f.status)">{{ f.status }}</span>
                  <span>{{ f.module }}</span>
                </div>
              </div>
            }

            @if (correlation.fusionExecutions.length > 0 && correlation.oicExecutions.length > 0) {
              <div class="corr-arrow">&rarr;</div>
            }

            @for (o of correlation.oicExecutions; track o.instance_id) {
              <div class="corr-node" [class.node-failed]="o.status === 'FAILED'" [class.node-success]="o.status === 'SUCCESS'">
                <div style="font-size: 11px; color: var(--muted); font-weight: 700;">OIC INTEGRATION</div>
                <div style="font-weight: 700; margin: 2px 0;">
                  <a [routerLink]="['/oic', o.instance_id]">{{ o.instance_id }}</a> &bull; {{ o.integration_name }}
                </div>
                <div style="font-size: 12px; display: flex; gap: 6px; align-items: center;">
                  <span [class]="badgeClass(o.status)">{{ o.status }}</span>
                  <span>{{ o.source_system }}</span>
                </div>
              </div>
            }

            @if (correlation.impactedDownstream.length > 0) {
              <div class="corr-arrow">&rarr;</div>
              @for (d of correlation.impactedDownstream; track d.system_id) {
                <div class="corr-node node-downstream">
                  <div style="font-size: 11px; color: var(--muted); font-weight: 700;">DOWNSTREAM SYSTEM</div>
                  <div style="font-weight: 700; margin: 2px 0;">{{ d.system_name }}</div>
                  <span [class]="badgeClass(d.criticality)">{{ d.criticality }} Criticality</span>
                </div>
              }
            }
          </div>

          <div style="margin-top: 8px; padding: 10px 12px; background: #fff; border-radius: 6px; border: 1px solid var(--border); font-size: 13px;">
            <strong>Impact Assessment:</strong> {{ correlation.businessImpact }}
          </div>
        </div>
      </div>
    }
  `
})
export class CorrelationPanelComponent {
  @Input() correlation?: CorrelationContext;
  protected readonly badgeClass = badgeClass;
}
