import Memcached from 'memcached';

export const memcachedDefault = new Memcached('localhost:11211', {
  maxExpiration: 8 * 24 * 60 * 60, // 8 days
  reconnect: 1000,
  retries: 0,
  failures: 1,
  timeout: 1000,
  retry: 1000,
});

export class MemcachedMethodError extends Error {
  public reason;
  constructor(message: 'internal error' | 'cache miss', reason: unknown) {
    super(message);
    this.reason = reason;
  }
}

type MemcachedMethodSuccess = {
  message: string;
  result?: unknown;
};

const set = async (key: string, value: string | Buffer, lifetime: number) =>
  new Promise<MemcachedMethodSuccess>((resolve, reject) => {
    memcachedDefault.set(key, value, lifetime, (err, result) => {
      if (err) {
        reject(new MemcachedMethodError('internal error', err));
      } else {
        resolve({
          message: `cache with key "${key}" set`,
          result,
        });
      }
    });
  });

const get = async (key: string) =>
  new Promise<MemcachedMethodSuccess>((resolve, reject) => {
    memcachedDefault.get(key, (err, data) => {
      if (err) {
        reject(new MemcachedMethodError('internal error', err));
      } else if (!data) {
        reject(new MemcachedMethodError('cache miss', 'key not found'));
      } else {
        resolve({
          message: 'cache hit',
          result: data,
        });
      }
    });
  });

const touch = async (key: string, lifetime: number) =>
  new Promise<Omit<MemcachedMethodSuccess, 'result'>>((resolve, reject) => {
    memcachedDefault.touch(key, lifetime, err => {
      if (err) {
        reject(new MemcachedMethodError('internal error', err));
      } else {
        resolve({
          message: `key "${key}" prolonged for ${lifetime} seconds`,
        });
      }
    });
  });

const del = async (key: string) =>
  new Promise<MemcachedMethodSuccess>((resolve, reject) => {
    memcachedDefault.del(key, (err, result) => {
      if (err) {
        reject(new MemcachedMethodError('internal error', err));
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

export const cacheDuration = {
  super: 7 * 24 * 60 * 60, // 7 days
  long: 60 * 60, // 1 hour
  medium: 30 * 60, // 30 minutes
  short: 5 * 60, // 5 minutes
};
