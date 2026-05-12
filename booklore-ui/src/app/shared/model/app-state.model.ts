export interface AppState {
  preset?: string;
  primary?: string;
  surface?: string;
  customPrimaryColor?: string;
  customSurfaceColor?: string;
  customPrimaryGenerated?: Record<number, string>;
  customSurfaceGenerated?: Record<number, string>;
}