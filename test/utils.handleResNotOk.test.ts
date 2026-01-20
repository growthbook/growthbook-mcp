import { describe, expect, it } from "vitest";
import { handleResNotOk } from "../src/utils.js";

function makeRes(opts: {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText: string;
}): Pick<Response, "ok" | "status" | "statusText" | "text"> {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText,
    text: async () => opts.bodyText,
  };
}

describe("handleResNotOk", () => {
  it("does nothing when ok", async () => {
    await expect(
      handleResNotOk(
        makeRes({
          ok: true,
          status: 200,
          statusText: "OK",
          bodyText: "",
        }) as Response
      )
    ).resolves.toBeUndefined();
  });

  it("throws with JSON body when response not ok", async () => {
    await expect(
      handleResNotOk(
        makeRes({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          bodyText: JSON.stringify({ error: "nope", code: 123 }),
        }) as Response
      )
    ).rejects.toThrow(
      'HTTP 400 Bad Request: {"error":"nope","code":123}'
    );
  });

  it("throws with plain text body when response not ok", async () => {
    await expect(
      handleResNotOk(
        makeRes({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          bodyText: "oops",
        }) as Response
      )
    ).rejects.toThrow("HTTP 500 Internal Server Error: oops");
  });
});

