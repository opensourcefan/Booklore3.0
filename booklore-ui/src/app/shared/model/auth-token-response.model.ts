export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expires: number;
  isDefaultPassword: boolean;
}