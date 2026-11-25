import { describe, expect, it } from "vitest";

import { hasLinkRequestMarker, LINK_REQUEST_COOKIE } from "@/lib/auth/link-request";

describe("hasLinkRequestMarker", () => {
  it("finds the marker among other cookies", () => {
    expect(hasLinkRequestMarker(`a=1; ${LINK_REQUEST_COOKIE}=1; b=2`)).toBe(true);
    expect(hasLinkRequestMarker(`${LINK_REQUEST_COOKIE}=1`)).toBe(true);
  });

  it("is false without it or with another value", () => {
    expect(hasLinkRequestMarker("")).toBe(false);
    expect(hasLinkRequestMarker(`${LINK_REQUEST_COOKIE}=0; x=1`)).toBe(false);
    expect(hasLinkRequestMarker(`x${LINK_REQUEST_COOKIE}=1`)).toBe(false);
  });
});
