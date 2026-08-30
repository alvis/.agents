import { describe, expect, it } from "vitest";

import { allowedHref, localHref, remoteHref, schemeOf, SCHEMES } from "./href.ts";

describe("fn:schemeOf", () => {
  it("should read a plain scheme", () => {
    expect(schemeOf("https://example.test/x")).toEqual("https:");
  });

  it("should lower-case what it reads", () => {
    expect(schemeOf("HTTPS://example.test/x")).toEqual("https:");
  });

  it("should find no scheme in a relative path", () => {
    expect(schemeOf("./assets/x.png")).toBeUndefined();
  });

  it("should find no scheme in a fragment", () => {
    expect(schemeOf("#section-2")).toBeUndefined();
  });

  // the whole reason this lives in one module: a browser drops these before
  // it parses, so a check that runs before the same strip is checking a
  // different string from the one the URL parser will see
  it.each([
    [" javascript:alert(1)", "a leading space"],
    ["\tjavascript:alert(1)", "a leading tab"],
    ["\njavascript:alert(1)", "a leading newline"],
    ["jav\tascript:alert(1)", "a tab inside the scheme"],
    ["jav\nascript:alert(1)", "a newline inside the scheme"],
    ["java\u0000script:alert(1)", "a NUL inside the scheme"],
  ])("should see through %j (%s)", (href) => {
    expect(schemeOf(href)).toEqual("javascript:");
  });
});

describe("fn:allowedHref", () => {
  it.each(SCHEMES)("should allow %s", (scheme) => {
    expect(allowedHref(`${scheme}//example.test/x`)).toBe(true);
  });

  it("should allow a relative path", () => {
    expect(allowedHref("../notes/x.html")).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "jav\tascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("should refuse %j", (href) => {
    expect(allowedHref(href)).toBe(false);
  });
});

describe("fn:localHref", () => {
  it.each(["#a", " #a", "\t#a"])("should call %j local to the page", (href) => {
    expect(localHref(href)).toBe(true);
  });

  it.each(["a.png", "./a.png", "/a.png", "https://x/y#a", "//x/y#a", ""])(
    "should not call %j local to the page",
    (href) => {
      expect(localHref(href)).toBe(false);
    },
  );
});

describe("fn:remoteHref", () => {
  it.each(["http://x/y", "https://x/y", "//x/y", "data:text/plain,x", "mailto:a@b"])(
    "should call %s remote",
    (src) => {
      expect(remoteHref(src)).toBe(true);
    },
  );

  it.each(["a.png", "./a.png", "../a.png", "/a.png", "#anchor"])(
    "should call %s local",
    (src) => {
      expect(remoteHref(src)).toBe(false);
    },
  );

  // the reason there is one reader rather than two: the pattern this replaced
  // was anchored on the raw string, so every one of these read as local
  it.each([" https://x/y", "http\t://x/y", " //x/y"])(
    "should see through %j",
    (src) => {
      expect(remoteHref(src)).toBe(true);
    },
  );
});
