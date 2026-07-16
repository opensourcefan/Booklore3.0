import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {BehaviorSubject} from 'rxjs';
import {CoverPreviewComponent} from './cover-preview.component';
import {UiPreferencesService} from '../../service/ui-preferences.service';
import {MobileUxService} from '../../../core/services/mobile-ux.service';

describe('CoverPreviewComponent resize', () => {
  let fixture: ComponentFixture<CoverPreviewComponent>;
  let component: CoverPreviewComponent;
  let showResizeHandles$: BehaviorSubject<boolean>;

  beforeEach(async () => {
    localStorage.clear();
    showResizeHandles$ = new BehaviorSubject(false);

    await TestBed.configureTestingModule({
      imports: [CoverPreviewComponent],
      providers: [
        {
          provide: UiPreferencesService,
          useValue: {
            showResizeHandles: false,
            showResizeHandles$: showResizeHandles$.asObservable(),
          }
        },
        {
          provide: MobileUxService,
          useValue: {
            hasTouchInput: true,
            isMobileOrTablet: false,
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CoverPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uses pointer events so touch drag can resize the panel', () => {
    const panel = fixture.nativeElement.querySelector('.cover-preview-panel') as HTMLElement;
    const handle = fixture.nativeElement.querySelector('.cover-preview-resize-handle') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(handle).toBeTruthy();

    // Simulate a touch-like pointer drag upward (taller panel).
    Object.defineProperty(panel, 'offsetHeight', {configurable: true, value: 300});
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientY: 400,
      pointerId: 1,
      pointerType: 'touch'
    }));
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientY: 300,
      pointerId: 1,
      pointerType: 'touch'
    }));
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      clientY: 300,
      pointerId: 1,
      pointerType: 'touch'
    }));

    expect(panel.style.height).toBe('400px');
    expect(localStorage.getItem('bl-cover-preview-height')).toBe('400');
  });

  it('shows a visible thumb handle when touch input is present', () => {
    expect(component.thumbHandles).toBe(true);
    const handle = fixture.nativeElement.querySelector('.cover-preview-resize-handle') as HTMLElement;
    expect(handle.classList.contains('cover-preview-resize-handle--visible')).toBe(true);
  });
});
