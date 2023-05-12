import { CookieOptions } from 'express';

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'none', //please set to lax if using other api in another subdomain
  signed: true,
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// __Host- screw things up for tauri
// export const csrfCookieName = `${cookieConfig.secure ? '__Host-' : ''}${process.env.DOMAIN || 'api.com'}.x-csrf-token`;
export const csrfCookieName = 'x-csrf-token';

// export const refreshCookieName = `${cookieConfig.secure ? '__Host-' : ''}${
//   process.env.DOMAIN || 'api.com'
// }.x-refresh-token`;
export const refreshCookieName = 'x-refresh-token';

export const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'super secret cookie';
