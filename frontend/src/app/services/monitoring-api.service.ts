import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DashboardSummary,
  FailureIncident,
  FusionExecution,
  OicExecution,
  PaginatedResponse
} from '../models/monitoring.models';

@Injectable({ providedIn: 'root' })
export class MonitoringApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  readonly toast = signal<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  private readonly refreshSubject = new Subject<void>();
  readonly refresh$ = this.refreshSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    this.toast.set({ message, type });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 5000);
  }

  clearToast(): void {
    this.toast.set(null);
  }

  triggerRefresh(): void {
    this.refreshSubject.next();
  }

  private buildParams(filters: Record<string, string | number | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return params;
  }

  private buildQueryString(filters: Record<string, string | number | undefined | null>): string {
    const entries = Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return entries.length ? `?${entries.join('&')}` : '';
  }

  getMetadata(): Observable<{ modules: string[]; sources: string[] }> {
    return this.http.get<{ modules: string[]; sources: string[] }>(
      `${this.baseUrl}/dashboard/metadata`
    );
  }

  getDashboardSummary(filters: { module?: string; dateFrom?: string; dateTo?: string }): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard/summary`, {
      params: this.buildParams(filters)
    });
  }

  listFusionJobs(filters: Record<string, string | number>): Observable<PaginatedResponse<FusionExecution>> {
    return this.http.get<PaginatedResponse<FusionExecution>>(`${this.baseUrl}/fusion/jobs`, {
      params: this.buildParams(filters)
    });
  }

  getFusionJob(executionId: string): Observable<FusionExecution> {
    return this.http.get<FusionExecution>(`${this.baseUrl}/fusion/jobs/${encodeURIComponent(executionId)}`);
  }

  getFusionCsvUrl(filters: Record<string, string | number>): string {
    const copy: Record<string, string | number> = { ...filters, format: 'csv' };
    delete copy['page'];
    delete copy['limit'];
    return `${this.baseUrl}/fusion/jobs${this.buildQueryString(copy)}`;
  }

  listOicIntegrations(filters: Record<string, string | number>): Observable<PaginatedResponse<OicExecution>> {
    return this.http.get<PaginatedResponse<OicExecution>>(`${this.baseUrl}/oic/integrations`, {
      params: this.buildParams(filters)
    });
  }

  getOicIntegration(instanceId: string): Observable<OicExecution> {
    return this.http.get<OicExecution>(`${this.baseUrl}/oic/integrations/${encodeURIComponent(instanceId)}`);
  }

  getOicCsvUrl(filters: Record<string, string | number>): string {
    const copy: Record<string, string | number> = { ...filters, format: 'csv' };
    delete copy['page'];
    delete copy['limit'];
    return `${this.baseUrl}/oic/integrations${this.buildQueryString(copy)}`;
  }

  listIncidents(filters: Record<string, string | number>): Observable<PaginatedResponse<FailureIncident>> {
    return this.http.get<PaginatedResponse<FailureIncident>>(`${this.baseUrl}/incidents`, {
      params: this.buildParams(filters)
    });
  }

  getIncident(incidentId: string): Observable<FailureIncident> {
    return this.http.get<FailureIncident>(`${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}`);
  }

  getIncidentsCsvUrl(filters: Record<string, string | number>): string {
    const copy: Record<string, string | number> = { ...filters, format: 'csv' };
    delete copy['page'];
    delete copy['limit'];
    return `${this.baseUrl}/incidents${this.buildQueryString(copy)}`;
  }

  updateIncidentStatus(
    incidentId: string,
    payload: { status: string; notes?: string; performedBy?: string }
  ): Observable<FailureIncident> {
    return this.http.put<FailureIncident>(
      `${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}/status`,
      payload
    );
  }

  retryIncident(
    incidentId: string,
    payload: { notes?: string; performedBy?: string }
  ): Observable<FailureIncident> {
    return this.http.post<FailureIncident>(
      `${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}/retry`,
      payload
    );
  }

  simulateEvent(payload: { forceFailure?: boolean; sourceType?: string } = {}): Observable<{
    sourceType: string;
    execution: { execution_id?: string; instance_id?: string; status: string };
    incident: FailureIncident | null;
  }> {
    return this.http.post<{
      sourceType: string;
      execution: { execution_id?: string; instance_id?: string; status: string };
      incident: FailureIncident | null;
    }>(`${this.baseUrl}/simulator/tick`, payload);
  }
}
