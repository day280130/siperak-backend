import { memcachedDefault } from "@src/configs/MemcachedConfigs.js";

export class MemcachedMethodError extends Error {
  private _reason;

  constructor(message: "internal error" | "cache miss", reason: unknown) {
    super(message);
    this._reason = reason;
  }

  get reason() {
    return this._reason;
  }
}

type MemcachedMethodSuccess<T = unknown> = {
  message: string;
  result: T;
};

const set = async (key: string, value: string | Buffer, lifetime: number) =>
  new Promise<MemcachedMethodSuccess<boolean>>((resolve, reject) => {
    memcachedDefault.set(key, value, lifetime, (err, result) => {
      if (err) {
        reject(new MemcachedMethodError("internal error", err));
      } else {
        resolve({
          message: `cache with key "${key}" set`,
          result,
        });
      }
    });
  });

const get = async <T>(key: string) =>
  new Promise<MemcachedMethodSuccess<T>>((resolve, reject) => {
    memcachedDefault.get(key, (err, data) => {
      if (err) {
        reject(new MemcachedMethodError("internal error", err));
      } else if (!data) {
        reject(new MemcachedMethodError("cache miss", "key not found"));
      } else {
        resolve({
          message: "cache hit",
          result: data,
        });
      }
    });
  });

const touch = async (key: string, lifetime: number) =>
  new Promise<Omit<MemcachedMethodSuccess, "result">>((resolve, reject) => {
    memcachedDefault.touch(key, lifetime, err => {
      if (err) {
        reject(new MemcachedMethodError("internal error", err));
      } else {
        resolve({
          message: `key "${key}" prolonged for ${lifetime} seconds`,
        });
      }
    });
  });

const del = async (key: string) =>
  new Promise<MemcachedMethodSuccess<boolean>>((resolve, reject) => {
    memcachedDefault.del(key, (err, result) => {
      if (err) {
        reject(new MemcachedMethodError("internal error", err));
      } else {
        resolve({
          message: `cache with key "${key}" deleted`,
          result,
        });
      }
    });
  });

/**
 * promisified memcached methods
 * created by : Dimas
 */
export const memcached = { set, get, touch, del };
