import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TableModule} from 'primeng/table';
import {ToastModule} from 'primeng/toast';
import {ViewPreferencesComponent} from './view-preferences/view-preferences.component';
import {SidebarSortingPreferencesComponent} from './sidebar-sorting-preferences/sidebar-sorting-preferences.component';
import {MetaCenterViewModeComponent} from './meta-center-view-mode/meta-center-view-mode-component';
import {FilterPreferencesComponent} from './filter-preferences/filter-preferences.component';
import {TranslocoDirective} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';
import {UiPreferencesService} from '../../../shared/service/ui-preferences.service';
import {ToggleSwitch} from 'primeng/toggleswitch';

@Component({
  selector: 'app-view-preferences-parent',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ToastModule,
    ViewPreferencesComponent,
    SidebarSortingPreferencesComponent,
    MetaCenterViewModeComponent,
    FilterPreferencesComponent,
    TranslocoDirective,
    ToggleSwitch,
  ],
  templateUrl: './view-preferences-parent.component.html',
  styleUrl: './view-preferences-parent.component.scss'
})
export class ViewPreferencesParentComponent implements OnInit {
  private uiPrefs = inject(UiPreferencesService);
  showCoverPreview = false;
  private messageService = inject(MessageService);

  ngOnInit(): void {
    this.showCoverPreview = this.uiPrefs.showCoverPreview;
  }

  onCoverPreviewToggle(checked: boolean): void {
    this.showCoverPreview = checked;
    this.uiPrefs.setShowCoverPreview(checked);
    this.messageService.add({ severity: 'success', summary: 'Saved',
      detail: checked ? 'Cover preview enabled' : 'Cover preview disabled' });
  }
}
