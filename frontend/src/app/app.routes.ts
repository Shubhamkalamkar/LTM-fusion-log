import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { FusionListComponent } from './pages/fusion/fusion-list.component';
import { FusionDetailComponent } from './pages/fusion/fusion-detail.component';
import { OicListComponent } from './pages/oic/oic-list.component';
import { OicDetailComponent } from './pages/oic/oic-detail.component';
import { IncidentsListComponent } from './pages/incidents/incidents-list.component';
import { IncidentDetailComponent } from './pages/incidents/incident-detail.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'fusion', component: FusionListComponent },
  { path: 'fusion/:executionId', component: FusionDetailComponent },
  { path: 'oic', component: OicListComponent },
  { path: 'oic/:instanceId', component: OicDetailComponent },
  { path: 'incidents', component: IncidentsListComponent },
  { path: 'incidents/:incidentId', component: IncidentDetailComponent },
  { path: '**', redirectTo: 'dashboard' }
];
