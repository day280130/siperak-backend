import { UserData } from "@src/schemas/UserSchema.js";
import { JwtPayload, VerifyOptions } from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";

type UserToken = Omit<UserData, "password">;

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

export interface JWTPayload extends JwtPayload {
  userId: UserToken["id"];
  userEmail: UserToken["email"];
  userName: UserToken["name"];
  userRole: UserToken["role"];
}

export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "super secret access token";
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "super secret refresh token";
