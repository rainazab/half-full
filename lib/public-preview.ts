import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { Readable } from "node:stream";
import { publicAddress } from "./network-safety";
/** HTTPS preview transport validates DNS at socket connection, preventing a second unvalidated lookup. */
export const fetchPublicPreview: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname.includes(":") ||
    /^[\d.]+$/.test(url.hostname)
  )
    throw Error("Public HTTPS only");
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal: init?.signal ?? undefined,
        headers: {
          Accept: "text/html",
          "Accept-Encoding": "identity",
          "User-Agent": "Mozilla/5.0 (compatible; HalfFullPreview/1.0)",
        },
        lookup(hostname, options, callback) {
          void lookup(hostname, { all: true, verbatim: true })
            .then((addresses) => {
              if (
                !addresses.length ||
                addresses.some((a) => !publicAddress(a.address))
              ) {
                callback(Error("Unsafe DNS destination"), "", 4);
                return;
              }
              if (options.all) callback(null, addresses);
              else callback(null, addresses[0].address, addresses[0].family);
            })
            .catch(() => callback(Error("DNS unavailable"), "", 4));
        },
      },
      (response) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const status = response.statusCode ?? 502;
        if ([204, 205, 304].includes(status)) {
          response.resume();
          resolve(new Response(null, { status, headers }));
          return;
        }
        resolve(
          new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
            status,
            headers,
          }),
        );
      },
    );
    req.on("error", () => reject(Error("Preview request unavailable")));
    req.end();
  });
};
