import { cacheDuration, memcachedDefault } from "@src/configs/MemcachedConfigs.js";
import { logError } from "@src/helpers/HandlerHelpers.js";
import { z } from "zod";

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

type MemcachedMethodSuccess<T = unknown, M = string> = {
  message: M;
  result: T;
};

const set = async (key: string, value: string | Buffer, lifetime: number) =>
  new Promise<MemcachedMethodSuccess<boolean>>((resolve, reject) => {
    memcachedDefault.set(key, value, lifetime, (err, result) => {
      if (err) {
        // console.log(err);
        reject(new MemcachedMethodError("internal error", err.toString()));
      } else {
        resolve({
          message: `cache with key "${key}" set`,
          result,
        });
      }
    });
  });

const get = async <T>(key: string) =>
  new Promise<MemcachedMethodSuccess<T, "cache hit">>((resolve, reject) => {
    memcachedDefault.get(key, (err, data) => {
      if (err) {
        // console.log(err);
        reject(new MemcachedMethodError("internal error", err.toString()));
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
        // console.log(err);
        reject(new MemcachedMethodError("internal error", err.toString()));
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
        // console.log(err);
        reject(new MemcachedMethodError("internal error", err.toString()));
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

export const getCachedQueryKeys = async (field: string) => {
  // get current cached query key list
  const cachedQueryKeys = (
    await memcached.get<string>(`${field}:queries`).catch(() => ({
      message: "cache miss",
      result: "[]",
    }))
  ).result;
  const cachedQueryKeysArr = JSON.parse(cachedQueryKeys);
  // console.log(`cached ${field} query keys :`, cachedQueryKeysArr);

  return cachedQueryKeysArr as string[];
};

export const registerCachedQueryKey = async (field: string, cacheKey: string) => {
  // get current cached query key list
  const cachedQueryKeys = (
    await memcached.get<string>(`${field}:queries`).catch(() => ({
      message: "cache miss",
      result: "[]",
    }))
  ).result;
  const cachedQueryKeysArr = JSON.parse(cachedQueryKeys);

  // push the new cached query key
  cachedQueryKeysArr.push(cacheKey);
  // console.log(`updated ${field} query keys(new) :`, cachedQueryKeysArr);

  // put the list back to cache
  memcached
    .set(`${field}:queries`, JSON.stringify(cachedQueryKeysArr), cacheDuration.super)
    .catch(error => logError("register cached query keys", error.reason ?? error, false));
};

export const eraseCachedQueryKey = async (field: string, cacheKey: string) => {
  // get current cached query key list
  let cachedQueryKeysArr: string[];
  try {
    const unParsedCachedQueryKeys = (await memcached.get<string>(`${field}:queries`)).result;
    cachedQueryKeysArr = z.array(z.string()).min(1).parse(JSON.parse(unParsedCachedQueryKeys));
  } catch (e) {
    return;
  }

  // filter the cacheKey out
  const newCachedQueryKeysArr = cachedQueryKeysArr.filter(value => value !== cacheKey);
  // console.log(`updated ${field} query keys(delete) :`, newCachedQueryKeysArr);

  // put the list back to cache
  memcached
    .set(`${field}:queries`, JSON.stringify(newCachedQueryKeysArr), cacheDuration.super)
    .catch(error => logError("register cached query keys", error.reason ?? error, false));
};

export const invalidateCachedQueries = async (field: string) => {
  // get current cached query key list
  let cachedQueryKeys: string;
  try {
    cachedQueryKeys = (await memcached.get<string>(`${field}:queries`)).result;
  } catch (e) {
    return;
  }
  const cachedQueryKeysArr = z.array(z.string()).min(1).safeParse(JSON.parse(cachedQueryKeys));
  if (!cachedQueryKeysArr.success) return;
  // console.log(`deleted ${field} query keys :`, cachedQueryKeysArr.data);

  // loop through the array and delete each cached query
  cachedQueryKeysArr.data.forEach(cachedQueryKey => memcached.del(cachedQueryKey).catch());

  // delete cached query key list
  memcached.del(`${field}:queries`).catch(error => logError("invalidate cached queries", error.reason ?? error, false));
};
