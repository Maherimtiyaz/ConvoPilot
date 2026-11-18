import { describe, expect, it } from "vitest";

import { problemFromInvitationSignupError, problemFromLoginLinkError, problemFromVerifyError } from "@/lib/auth/errors";

describe("auth error mapping", () => {
  it("never reveals whether an email has an account on the login page", () => {
    expect(problemFromLoginLinkError({ status: 422, code: "otp_disabled" })).toBeNull();
    expect(problemFromLoginLinkError({ status: 400 })).toBeNull();
    expect(problemFromLoginLinkError({ status: 429 })).toBe("rate_limited");
    expect(problemFromLoginLinkError({ status: 500 })).toBe("unexpected");
  });

  it("maps invitation rejections to one generic message", () => {
    expect(problemFromInvitationSignupError({ status: 403, code: "unknown" })).toBe("invitation_invalid");
    expect(problemFromInvitationSignupError({ status: 422 })).toBe("invitation_invalid");
    expect(problemFromInvitationSignupError({ status: 429 })).toBe("rate_limited");
    expect(problemFromInvitationSignupError({ status: 500 })).toBe("unexpected");
  });

  it("treats used, expired and unknown links alike", () => {
    expect(problemFromVerifyError({ status: 403, code: "otp_expired" })).toBe("link_invalid");
    expect(problemFromVerifyError({ status: 400 })).toBe("link_invalid");
    expect(problemFromVerifyError({ status: 502 })).toBe("unexpected");
  });
});
