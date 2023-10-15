import { UserSafeData } from "@src/schemas/UserSchemas.js";
import { JwtPayload, VerifyOptions, SignOptions } from "jsonwebtoken";

export const accessTokenConfig: SignOptions = {
  algorithm: "HS256",
  expiresIn: "30m",
};

export const refreshTokenConfig: SignOptions = {
  algorithm: "HS512",
  expiresIn: "7d",
};

export const accessTokenVerifyConfig: VerifyOptions = {
  algorithms: ["HS256"],
};

export const refreshTokenVerifyConfig: VerifyOptions = {
  algorithms: ["HS512"],
};

export type JWTPayload = JwtPayload & UserSafeData;

export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "super secret access token";
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "super secret refresh token";
