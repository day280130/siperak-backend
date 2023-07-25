import Memcached from "memcached";

export const memcachedDefault = new Memcached(process.env.CACHE_DB_URL ?? "localhost:11211", {
  maxExpiration: 8 * 24 * 60 * 60, // 8 days
  reconnect: 1000,
  retries: 0,
  failures: 1,
  timeout: 1000,
  retry: 1000,
});

// memcachedDefault.settings((_, settings) => {
//   console.log(settings);
// });

export const cacheDuration = {
  super: 604800, // 7 days
  long: 3600, // 1 hour
  medium: 1800, // 30 minutes
  short: 300, // 5 minutes
} as const;
