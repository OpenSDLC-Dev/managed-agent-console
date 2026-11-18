/** The native edge origins walked by the Chrome presentation fixtures. */
export const MOCK_PORT = 18081;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
export const GATEWAY_PORT = 18071;
export const CONSOLE_PORTS = {
  platform: 38200,
  password: 3101,
  sso: 3111,
} as const;
export type ConsoleMode = keyof typeof CONSOLE_PORTS;
export const DEFAULT_MODE: ConsoleMode = "password";
export const consoleUrl = (mode: ConsoleMode = DEFAULT_MODE) =>
  `http://127.0.0.1:${CONSOLE_PORTS[mode]}`;
