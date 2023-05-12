import { UserData } from '@src/schemas/UserSchema.js';
import { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';

type UserToken = Omit<UserData, 'password'>;

export const accessTokenConfig: SignOptions = {
  algorithm: 'HS256',
  expiresIn: '30m',
};

export const refreshTokenConfig: SignOptions = {
  algorithm: 'HS512',
  expiresIn: '7d',
};

export const accessTokenVerifyConfig: VerifyOptions = {
  algorithms: ['HS256'],
};

export const refreshTokenVerifyConfig: VerifyOptions = {
  algorithms: ['HS512'],
};

export interface JWTPayload extends JwtPayload {
  userId: UserToken['id'];
  userEmail: UserToken['email'];
  userName: UserToken['name'];
  userRole: UserToken['role'];
}

export const JWT_SECRET = process.env.JWT_SECRET || 'super secret jwt';
