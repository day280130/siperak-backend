import { BinaryLike, scrypt } from "crypto";

export const scryptPromisified = async (password: BinaryLike, salt: BinaryLike, keylen: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });

export const PASSWORD_SECRET = process.env.PASSWORD_SECRET || "super secret password";
