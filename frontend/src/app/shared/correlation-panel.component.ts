import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CorrelationContext } from '../models/monitoring.models';
import { badgeClass } from './formatters';

@Component({
  selector: 'app-correlation-panel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './correlation-panel.component.html',
  styleUrl: './correlation-panel.component.css'
})
export class CorrelationPanelComponent {
  @Input() correlation?: CorrelationContext;
  protected readonly badgeClass = badgeClass;
}
