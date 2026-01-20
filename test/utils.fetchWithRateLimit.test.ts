import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRateLimit } from "../src/utils.js";

function makeHeaders(init?: Record<string, string>) {
  return new Headers(init);
}

function makeFetchResponse(opts: {
  status: number;
  headers?: Record<string, string>;
}): Pick<Response, "status" | "headers"> {
  return {
    status: opts.status,
    headers: makeHeaders(opts.headers),
  };
}

describe("fetchWithRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("waits a small courtesy delay before calling fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithRateLimit("https://example.com", { method: "GET" });

    expect(fetchSpy).not.toHaveBeenCalled();

    // MIN_DELAY_MS in src/utils.ts is 50ms
    await vi.advanceTimersByTimeAsync(50);
    await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 using RateLimit-Reset header", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          status: 429,
          headers: { "RateLimit-Reset": "2" },
        }) as Response
      )
      .mockResolvedValueOnce(makeFetchResponse({ status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithRateLimit("https://example.com", { method: "GET" }, 1);

    // First delay (50ms) + rate limit wait (2s) + second delay (50ms)
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const res = await p;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when retries reach 0 and returns the 429 response", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        makeFetchResponse({
          status: 429,
          headers: { "RateLimit-Reset": "1" },
        }) as Response
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithRateLimit("https://example.com", { method: "GET" }, 0);

    await vi.advanceTimersByTimeAsync(50);
    const res = await p;

    expect(res.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

