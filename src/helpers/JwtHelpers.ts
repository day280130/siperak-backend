import {
  ACCESS_TOKEN_SECRET,
  JWTPayload,
  REFRESH_TOKEN_SECRET,
  accessTokenConfig,
  refreshTokenConfig,
} from '@src/configs/JwtConfigs.js';
import jwt from 'jsonwebtoken';

const sign = async (tokenType: 'REFRESH_TOKEN' | 'ACCESS_TOKEN', initialPayload: JWTPayload) => {
  let config: jwt.SignOptions;
  let secret: jwt.Secret;
  if (tokenType === 'ACCESS_TOKEN') {
    config = accessTokenConfig;
    secret = ACCESS_TOKEN_SECRET;
  } else if (tokenType === 'REFRESH_TOKEN') {
    config = refreshTokenConfig;
    secret = REFRESH_TOKEN_SECRET;
  } else {
    return new Promise<string>((_resolve, reject) => {
      reject('valid token type not supplied');
    });
  }
  return new Promise<string>((resolve, reject) => {
    jwt.sign(initialPayload, secret, config, (error, token) => {
      if (error) {
        reject(error);
      } else {
        resolve(token ?? 'error');
      }
    });
  });
};

const verify = async (tokenType: 'REFRESH_TOKEN' | 'ACCESS_TOKEN', token: string) => {
  let config: jwt.VerifyOptions;
  let secret: jwt.Secret;
  if (tokenType === 'ACCESS_TOKEN') {
    config = accessTokenConfig;
    secret = ACCESS_TOKEN_SECRET;
  } else if (tokenType === 'REFRESH_TOKEN') {
    config = refreshTokenConfig;
    secret = REFRESH_TOKEN_SECRET;
  } else {
    return new Promise<string>((_resolve, reject) => {
      reject('valid token type not supplied');
    });
  }
  return new Promise<JWTPayload>((resolve, reject) => {
    jwt.verify(token, secret, config, (error, payload) => {
      if (error) {
        reject(error);
      } else {
        resolve(payload as JWTPayload);
      }
    });
  });
};

const decode = async (token: string) =>
  new Promise<JWTPayload>((resolve, reject) => {
    try {
      const decoded = jwt.decode(token);
      resolve(decoded as JWTPayload);
    } catch (error) {
      reject(error);
    }
  });

// importing jsonwebtokenerror directly from 'jsonwebtoken' throws error, so import from this instead
export const JsonWebTokenError = jwt.JsonWebTokenError;
export const TokenExpiredError = jwt.TokenExpiredError;

export const jwtPromisified = { sign, verify, decode };
