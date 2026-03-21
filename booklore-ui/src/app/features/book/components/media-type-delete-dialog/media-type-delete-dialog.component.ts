import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Button} from 'primeng/button';

@Component({
  selector: 'app-media-type-delete-dialog',
  standalone: true,
  imports: [Button],
  templateUrl: './media-type-delete-dialog.component.html',
  styleUrl: './media-type-delete-dialog.component.scss'
})
export class MediaTypeDeleteDialogComponent implements OnInit {
  private dynamicDialogRef = inject(DynamicDialogRef);
  private dynamicDialogConfig = inject(DynamicDialogConfig);

  mediaType = '';
  usageCount = 0;

  ngOnInit(): void {
    this.mediaType = this.dynamicDialogConfig.data?.mediaType ?? '';
    this.usageCount = this.dynamicDialogConfig.data?.usageCount ?? 0;
  }

  cancel(): void {
    this.dynamicDialogRef.close({confirmed: false});
  }

  confirmDelete(): void {
    this.dynamicDialogRef.close({confirmed: true});
  }
}