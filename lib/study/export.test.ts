import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/study/export";

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    expect(toCsv(["a", "b"], [["x,y", 'q"z']])).toBe('a,b\n"x,y","q""z"');
  });

  it("escapes newlines and passes plain values through", () => {
    expect(toCsv(["h"], [["line1\nline2"], [42]])).toBe('h\n"line1\nline2"\n42');
  });

  it("neutralizes formula-injection in string cells but not numbers", () => {
    expect(toCsv(["t"], [["=HYPERLINK(1)"]])).toBe("t\n'=HYPERLINK(1)");
    expect(toCsv(["t"], [["=1,2"]])).toBe('t\n"\'=1,2"'); // guarded then quoted (comma)
    expect(toCsv(["n"], [[-5]])).toBe("n\n-5"); // numeric stays numeric
  });
});
