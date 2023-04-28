import { CookieOptions } from 'express';

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'strict', //please set to lax if using other api in another subdomain
  signed: true,
  secure: false,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const csrfCookieName = `${cookieConfig.secure ? '__Host-' : ''}${process.env.DOMAIN || 'api.com'}.x-csrf-token`;

export const refreshCookieName = `${cookieConfig.secure ? '__Host-' : ''}${
  process.env.DOMAIN || 'api.com'
}.x-refresh-token`;

export const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'super secret cookie';
