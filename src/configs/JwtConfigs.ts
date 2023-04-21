import { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';

export const accessTokenConfig: SignOptions = {
  algorithm: 'HS256',
  expiresIn: '30m',
};

export const refreshTokenConfig: SignOptions = {
  algorithm: 'HS256',
  expiresIn: '7d',
};

export const verifyConfig: VerifyOptions = {
  algorithms: ['HS256'],
};

export interface JWTPayload extends JwtPayload {
  userId: string;
  userEmail: string;
  userName: string;
}

export const JWT_SECRET = process.env.JWT_SECRET || 'super secret jwt';
