import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  return inject(AuthService).loggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** The landing page is for visitors; people who are signed in go straight to their leads. */
export const landingGuard: CanActivateFn = () => {
  return inject(AuthService).loggedIn() ? inject(Router).createUrlTree(['/leads']) : true;
};
