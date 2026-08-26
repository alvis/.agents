import { describe, expect, it } from "vitest";

import { syncAttribute, syncKey, termKey } from "./sync.ts";

describe("fn:syncKey", () => {
  it("should namespace a name by its family", () => {
    expect(syncKey("term", "dual-write")).toBe("term:dual-write");
  });

  it("should keep two families apart under one name", () => {
    expect(syncKey("pin", "1")).not.toBe(syncKey("tie", "1"));
  });
});

describe("fn:syncAttribute", () => {
  it("should build an attribute ready to place in a tag", () => {
    expect(syncAttribute("tie", "ack-record")).toBe(' data-sync="tie:ack-record"');
  });

  it("should escape a name that would otherwise close the attribute", () => {
    expect(syncAttribute("tie", 'a" onerror="x')).not.toContain('" onerror');
  });
});

describe("fn:termKey", () => {
  it("should fold case and spacing to one key", () => {
    expect(termKey("Dual Write")).toBe("dual-write");
  });

  it("should read a sentence's wording and a glossary's as the same term", () => {
    expect(termKey("read-after-write")).toBe(termKey("Read After Write"));
  });

  it("should drop punctuation the two ends need not agree on", () => {
    expect(termKey("quorum?")).toBe("quorum");
  });

  it("should not guess that an inflection is its stem", () => {
    expect(termKey("dual writing")).not.toBe(termKey("dual write"));
  });
});
