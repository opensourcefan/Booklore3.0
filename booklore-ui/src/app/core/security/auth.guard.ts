import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {AuthService} from '../../shared/service/auth.service';

export const AuthGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const internalAccessToken = authService.getInternalAccessToken();
  const internalAccessTokenExpiry = authService.getInternalAccessTokenExpiry();
  const isDefaultPassword = authService.getInternalDefaultPassword();

  if (!internalAccessToken) {
    return router.createUrlTree(['/login']);
  }

  if (internalAccessTokenExpiry === null || isDefaultPassword === null || internalAccessTokenExpiry <= Date.now()) {
    authService.clearSessionOnLoginPage();
    return router.createUrlTree(['/login']);
  }

  if (isDefaultPassword) {
    return router.createUrlTree(['/change-password']);
  }

  return true;
};
