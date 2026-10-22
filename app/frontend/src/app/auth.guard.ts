import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  return inject(AuthService).loggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** Guests keep the default profile, so the setup picker is not for them. */
export const notGuestGuard: CanActivateFn = () => {
  return inject(AuthService).isGuest() ? inject(Router).createUrlTree(['/leads']) : true;
};

/** The admin pages; anyone else goes to their leads. */
export const adminGuard: CanActivateFn = () => {
  return inject(AuthService).isAdmin() ? true : inject(Router).createUrlTree(['/leads']);
};

/** The landing page is for visitors; people who are signed in go straight to their leads. */
export const landingGuard: CanActivateFn = () => {
  return inject(AuthService).loggedIn() ? inject(Router).createUrlTree(['/leads']) : true;
};
