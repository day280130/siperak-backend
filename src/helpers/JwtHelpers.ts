import {
  ACCESS_TOKEN_SECRET,
  JWTPayload,
  REFRESH_TOKEN_SECRET,
  accessTokenConfig,
  refreshTokenConfig,
} from "@src/configs/JwtConfigs.js";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

const sign = async (tokenType: "REFRESH_TOKEN" | "ACCESS_TOKEN", initialPayload: JWTPayload) => {
  const config = tokenType === "ACCESS_TOKEN" ? accessTokenConfig : refreshTokenConfig;
  const secret = tokenType === "ACCESS_TOKEN" ? ACCESS_TOKEN_SECRET : REFRESH_TOKEN_SECRET;
  // let config: jwt.SignOptions;
  // let secret: jwt.Secret;
  // if (tokenType === "ACCESS_TOKEN") {
  //   config = accessTokenConfig;
  //   secret = ACCESS_TOKEN_SECRET;
  // } else if (tokenType === "REFRESH_TOKEN") {
  //   config = refreshTokenConfig;
  //   secret = REFRESH_TOKEN_SECRET;
  // } else {
  //   return new Promise<string>((_resolve, reject) => {
  //     reject("valid token type not supplied");
  //   });
  // }
  const randomData = randomBytes(128).toString();
  const randomHash = createHash("sha256").update(randomData).digest("hex");
  const payload: JWTPayload = {
    ...initialPayload,
    randomHash,
  };
  return new Promise<string>((resolve, reject) => {
    jwt.sign(payload, secret, config, (error, token) => {
      if (error || !token) {
        reject(error ?? "error");
      } else {
        resolve(token);
      }
    });
  });
};

const verify = async (tokenType: "REFRESH_TOKEN" | "ACCESS_TOKEN", token: string) => {
  const config: jwt.VerifyOptions = tokenType === "ACCESS_TOKEN" ? accessTokenConfig : refreshTokenConfig;
  const secret = tokenType === "ACCESS_TOKEN" ? ACCESS_TOKEN_SECRET : REFRESH_TOKEN_SECRET;
  // let config: jwt.VerifyOptions;
  // let secret: jwt.Secret;
  // if (tokenType === "ACCESS_TOKEN") {
  //   config = accessTokenConfig;
  //   secret = ACCESS_TOKEN_SECRET;
  // } else if (tokenType === "REFRESH_TOKEN") {
  //   config = refreshTokenConfig;
  //   secret = REFRESH_TOKEN_SECRET;
  // } else {
  //   return new Promise<string>((_resolve, reject) => {
  //     reject("valid token type not supplied");
  //   });
  // }
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
