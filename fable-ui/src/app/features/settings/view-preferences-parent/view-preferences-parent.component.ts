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
import {Select} from 'primeng/select';
import {InputText} from 'primeng/inputtext';

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
    Select,
    InputText,
  ],
  templateUrl: './view-preferences-parent.component.html',
  styleUrl: './view-preferences-parent.component.scss'
})
export class ViewPreferencesParentComponent implements OnInit {
  private uiPrefs = inject(UiPreferencesService);
  showCoverPreview = false;
  private messageService = inject(MessageService);

  layoutModeOptions = [
    { label: 'Automatic (Responsive)', value: 'auto' },
    { label: 'Phone Layout', value: 'phone' },
    { label: 'Tablet Layout', value: 'tablet' }
  ];

  selectedLayoutMode: 'auto' | 'phone' | 'tablet' = 'auto';
  phoneBreakpoint = 767;
  tabletBreakpoint = 1024;

  ngOnInit(): void {
    this.showCoverPreview = this.uiPrefs.showCoverPreview;
    this.selectedLayoutMode = this.uiPrefs.layoutMode;
    this.phoneBreakpoint = this.uiPrefs.phoneBreakpoint;
    this.tabletBreakpoint = this.uiPrefs.tabletBreakpoint;
  }

  onCoverPreviewToggle(checked: boolean): void {
    this.showCoverPreview = checked;
    this.uiPrefs.setShowCoverPreview(checked);
    this.messageService.add({ severity: 'success', summary: 'Saved',
      detail: checked ? 'Cover preview enabled' : 'Cover preview disabled' });
  }

  onLayoutModeChange(mode: 'auto' | 'phone' | 'tablet'): void {
    this.selectedLayoutMode = mode;
    this.uiPrefs.setLayoutMode(mode);
    this.messageService.add({ severity: 'success', summary: 'Saved', detail: `Layout mode set to ${mode}` });
  }

  onPhoneBreakpointChange(val: number): void {
    if (val && val > 0) {
      this.uiPrefs.setPhoneBreakpoint(val);
    }
  }

  onTabletBreakpointChange(val: number): void {
    if (val && val > 0) {
      this.uiPrefs.setTabletBreakpoint(val);
    }
  }
}
