import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';

export const AuthGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem('accessToken');

  if (!token) {
    router.navigate(['/login']);
    return false;
  }

  const payload = JSON.parse(atob(token.split('.')[1]));

  if (payload.isDefaultPassword) {
    router.navigate(['/change-password']);
    return false;
  }
  
  return true;
};
