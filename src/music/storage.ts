const COOKIE_KEY = "music-cloud:ncm-cookie";

export function readCookie() {
  return window.localStorage.getItem(COOKIE_KEY) || "";
}

export function writeCookie(cookie: string) {
  window.localStorage.setItem(COOKIE_KEY, cookie);
}

export function clearCookie() {
  window.localStorage.removeItem(COOKIE_KEY);
}
