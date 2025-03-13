export const environment = {
  production: true,
  API_CONFIG: {
    BASE_URL: `http://${window.location.hostname}:${window.location.port}`,
    BROKER_URL: `ws://${window.location.hostname}:${window.location.port}/ws`,
  },
};
