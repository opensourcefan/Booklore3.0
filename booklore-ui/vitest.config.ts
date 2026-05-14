import {defineConfig, mergeConfig} from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import baseConfig from './vitest-base.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [angular({tsconfig: 'tsconfig.spec.json'})],
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
      setupFiles: ['./src/test-setup.ts'],
      sequence: {
        hooks: 'stack'
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/app/**/*.ts'],
        exclude: ['src/app/**/*.spec.ts', 'src/app/**/*.module.ts']
      }
    }
  })
);
