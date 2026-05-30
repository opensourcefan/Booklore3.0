import {Renderer2} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppLayoutComponent} from './app.layout.component';
import {LayoutService} from './service/app.layout.service';

describe('AppLayoutComponent route reattach', () => {
  let fixture: ComponentFixture<AppLayoutComponent>;
  let component: AppLayoutComponent;
  let routerEvents: Subject<unknown>;

  beforeEach(async () => {
    routerEvents = new Subject<unknown>();

    await TestBed.configureTestingModule({
      imports: [AppLayoutComponent],
      providers: [
        {
          provide: LayoutService,
          useValue: {
            overlayOpen$: new Subject<unknown>().asObservable(),
            state: {
              staticMenuDesktopInactive: false,
              overlayMenuActive: false,
              profileSidebarVisible: false,
              configSidebarVisible: false,
              staticMenuMobileActive: false,
              menuHoverActive: false,
            },
            config: () => ({menuMode: 'static'})
          }
        },
        {
          provide: Renderer2,
          useValue: {
            listen: vi.fn(() => vi.fn())
          }
        },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable()
          }
        }
      ]
    })
      .overrideComponent(AppLayoutComponent, {
        set: {template: ''}
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppLayoutComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should notify reattach-aware components after router outlet attach', async () => {
    const onRouteReattached = vi.fn();

    component.onRouteAttach({onRouteReattached});
    await Promise.resolve();

    expect(onRouteReattached).toHaveBeenCalledTimes(1);
  });

  it('should ignore attached components without a reattach hook', async () => {
    expect(() => component.onRouteAttach({})).not.toThrow();
    await Promise.resolve();
  });

  it('should notify detach-aware components after router outlet detach', async () => {
    const onRouteDetached = vi.fn();

    component.onRouteDetach({onRouteDetached});
    await Promise.resolve();

    expect(onRouteDetached).toHaveBeenCalledTimes(1);
  });

  it('should ignore detached components without a detach hook', async () => {
    expect(() => component.onRouteDetach({})).not.toThrow();
    await Promise.resolve();
  });
});