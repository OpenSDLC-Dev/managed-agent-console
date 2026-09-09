const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];

/** Keep local web-server probes out of a developer shell's catch-all proxy. */
export function ensureLoopbackProxyBypass(
  env: {
    [key: string]: string | undefined;
    NO_PROXY?: string;
    no_proxy?: string;
  } = process.env,
) {
  const entries = [env.NO_PROXY, env.no_proxy]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const value = [...new Set([...entries, ...LOOPBACK_HOSTS])].join(",");
  env.NO_PROXY = value;
  env.no_proxy = value;
}
