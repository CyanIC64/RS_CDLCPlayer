import { describe, expect, it } from "vitest";
import { clamp, lerp, sstep, lowerBound, fmt, rgb, rgba, shade, tint } from "./util.js";

describe("numbers", () => {
  it("clamps, interpolates and smooths", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(sstep(-1)).toBe(0);
    expect(sstep(0.5)).toBe(0.5);
    expect(sstep(2)).toBe(1);
  });
});

describe("lowerBound", () => {
  const arr = [{ t: 1 }, { t: 2 }, { t: 2 }, { t: 5 }];
  it("finds the first item at or after a value", () => {
    expect(lowerBound(arr, "t", 0)).toBe(0);
    expect(lowerBound(arr, "t", 2)).toBe(1);
    expect(lowerBound(arr, "t", 3)).toBe(3);
    expect(lowerBound(arr, "t", 9)).toBe(4);
    expect(lowerBound([], "t", 1)).toBe(0);
  });
});

describe("fmt", () => {
  it("writes seconds as m:ss", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(65.9)).toBe("1:05");
    expect(fmt(-3)).toBe("0:00");
    expect(fmt(undefined)).toBe("0:00");
  });
});

describe("colours", () => {
  it("reads, fades, darkens and lightens a hex colour", () => {
    expect(rgb("#ff8000")).toEqual([255, 128, 0]);
    expect(rgba("#ff8000", 0.5)).toBe("rgba(255,128,0,0.500)");
    expect(shade("#ff8000", 0.5)).toBe("rgb(128,64,0)");
    expect(tint("#000000", 0.5)).toBe("rgb(128,128,128)");
  });
});
