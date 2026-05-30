import 'zone.js';
import 'zone.js/testing';
import {TestBed} from '@angular/core/testing';
import {BrowserDynamicTestingModule, platformBrowserDynamicTesting} from '@angular/platform-browser-dynamic/testing';

// Only initialize if not already initialized
if (!(globalThis as Record<string, unknown>)['__ANGULAR_TESTBED_INITIALIZED__']) {
  (globalThis as Record<string, unknown>)['__ANGULAR_TESTBED_INITIALIZED__'] = true;
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    {teardown: {destroyAfterEach: true}}
  );
}
