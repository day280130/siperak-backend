import {
  JWTPayload,
  JWT_SECRET,
  accessTokenConfig,
  refreshTokenConfig,
  verifyConfig,
} from '@src/configs/JwtConfigs.js';
import jwt from 'jsonwebtoken';

type SignParams =
  | {
      tokenType: 'ACCESS_TOKEN';
      initialPayload: JWTPayload;
      csrfToken: string;
    }
  | {
      tokenType: 'REFRESH_TOKEN';
      initialPayload: JWTPayload;
    };

const sign = async <T extends SignParams['tokenType']>(
  ...args: Extract<SignParams, { tokenType: T }> extends { csrfToken: string }
    ? [tokenType: T, initialPayload: JWTPayload, csrfToken: string]
    : [tokenType: T, initialPayload: JWTPayload]
) => {
  const [tokenType, initialPayload, csrfToken] = args;
  if (tokenType === 'ACCESS_TOKEN') {
    const config = accessTokenConfig;
    return new Promise<string>((resolve, reject) => {
      jwt.sign(initialPayload, `${JWT_SECRET}${csrfToken}`, config, (error, token) => {
        if (error) {
          reject(error);
        } else {
          resolve(token ?? 'error');
        }
      });
    });
  } else if (tokenType === 'REFRESH_TOKEN') {
    const config = refreshTokenConfig;
    return new Promise<string>((resolve, reject) => {
      jwt.sign(initialPayload, `${JWT_SECRET}`, config, (error, token) => {
        if (error) {
          reject(error);
        } else {
          resolve(token ?? 'error');
        }
      });
    });
  } else {
    return new Promise<string>((_resolve, reject) => {
      reject('token type not supplied');
    });
  }
};

type VerifyParams =
  | {
      tokenType: 'ACCESS_TOKEN';
      token: string;
      csrfToken: string;
    }
  | {
      tokenType: 'REFRESH_TOKEN';
      token: string;
    };

const verify = async <T extends VerifyParams['tokenType']>(
  ...args: Extract<VerifyParams, { tokenType: T }> extends { csrfToken: string }
    ? [tokenType: T, token: string, csrfToken: string]
    : [tokenType: T, token: string]
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_tokenType, token, csrfToken] = args;
  const secret = `${JWT_SECRET}${csrfToken ? csrfToken : ''}`;
  return new Promise<JWTPayload>((resolve, reject) => {
    jwt.verify(token, secret, verifyConfig, (error, payload) => {
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
