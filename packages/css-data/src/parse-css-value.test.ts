import { describe, test, expect } from "@jest/globals";
import { parseCssValue } from "./parse-css-value";
import { toValue, type StyleProperty } from "@webstudio-is/css-engine";

describe("Parse CSS value", () => {
  describe("number value", () => {
    test("unitless", () => {
      expect(parseCssValue("lineHeight", "10")).toEqual({
        type: "unit",
        unit: "number",
        value: 10,
      });
    });
  });

  describe("unit value", () => {
    test("with unit", () => {
      expect(parseCssValue("width", "10px")).toEqual({
        type: "unit",
        unit: "px",
        value: 10,
      });
    });

    test("empty input", () => {
      expect(parseCssValue("width", "")).toEqual({
        type: "invalid",
        value: "",
      });
    });
  });

  describe("keyword value", () => {
    test("keyword", () => {
      expect(parseCssValue("width", "auto")).toEqual({
        type: "keyword",
        value: "auto",
      });
    });

    test("keyword display block", () => {
      expect(parseCssValue("display", "block")).toEqual({
        type: "keyword",
        value: "block",
      });
    });

    test("keyword with unit", () => {
      expect(parseCssValue("width", "autopx")).toEqual({
        type: "invalid",
        value: "autopx",
      });
    });

    test("invalid", () => {
      // This will return px as a fallback unit, as number is not valid for width.
      expect(parseCssValue("width", "10")).toEqual({
        type: "invalid",
        value: "10",
      });

      // This will return number unit, as number is valid for aspectRatio.
      expect(parseCssValue("aspectRatio", "10")).toEqual({
        type: "unit",
        unit: "number",
        value: 10,
      });
    });
  });

  describe("Unparesd valid values", () => {
    test("Simple valid function values", () => {
      expect(parseCssValue("width", "calc(4px + 16em)")).toEqual({
        type: "unparsed",
        value: "calc(4px + 16em)",
      });
    });

    test("Invalid function values", () => {
      expect(parseCssValue("width", "blur(4)")).toEqual({
        type: "invalid",
        value: "blur(4)",
      });
    });
  });

  describe("Tuples", () => {
    test("objectPosition", () => {
      expect(parseCssValue("objectPosition", "left top")).toEqual({
        type: "tuple",
        value: [
          {
            type: "keyword",
            value: "left",
          },
          {
            type: "keyword",
            value: "top",
          },
        ],
      });
    });
  });

  describe("Colors", () => {
    test("Color rgba values", () => {
      expect(parseCssValue("backgroundColor", "rgba(0,0,0,0)")).toEqual({
        type: "rgb",
        alpha: 0,
        b: 0,
        g: 0,
        r: 0,
      });
    });

    test("modern format", () => {
      expect(parseCssValue("backgroundColor", "rgb(99 102 241/0.5)")).toEqual({
        type: "rgb",
        r: 99,
        g: 102,
        b: 241,
        alpha: 0.5,
      });
    });

    test("Color rgba values", () => {
      expect(parseCssValue("backgroundColor", "#00220011")).toEqual({
        type: "rgb",
        alpha: 0.07,
        b: 0,
        g: 34,
        r: 0,
      });
    });

    test("Color rgba values", () => {
      expect(parseCssValue("color", "red")).toEqual({
        type: "keyword",
        value: "red",
      });
    });
  });
});

test("parse background-image property as layers", () => {
  expect(
    parseCssValue(
      "backgroundImage",
      `linear-gradient(180deg, hsla(0, 0.00%, 0.00%, 0.11), white), url("https://667d0b7769e0cc3754b584f6"), none, url("https://667d0fe180995eadc1534a26")`
    )
  ).toEqual({
    type: "layers",
    value: [
      {
        type: "unparsed",
        value: "linear-gradient(180deg,hsla(0,0.00%,0.00%,0.11),white)",
      },
      {
        type: "image",
        value: { type: "url", url: "https://667d0b7769e0cc3754b584f6" },
      },
      {
        type: "keyword",
        value: "none",
      },
      {
        type: "image",
        value: { type: "url", url: "https://667d0fe180995eadc1534a26" },
      },
    ],
  });
});

test("parse background-position-* properties as layers", () => {
  expect(parseCssValue("backgroundPositionX", `0px, 550px, 0px, 0px`)).toEqual({
    type: "layers",
    value: [
      { type: "unit", unit: "px", value: 0 },
      { type: "unit", unit: "px", value: 550 },
      { type: "unit", unit: "px", value: 0 },
      { type: "unit", unit: "px", value: 0 },
    ],
  });
  expect(parseCssValue("backgroundPositionY", `0px, 0px, 0px, 0px`)).toEqual({
    type: "layers",
    value: [
      { type: "unit", unit: "px", value: 0 },
      { type: "unit", unit: "px", value: 0 },
      { type: "unit", unit: "px", value: 0 },
      { type: "unit", unit: "px", value: 0 },
    ],
  });
});

test("parse background-size property as layers", () => {
  expect(parseCssValue("backgroundSize", `auto, contain, auto, auto`)).toEqual({
    type: "layers",
    value: [
      { type: "keyword", value: "auto" },
      { type: "keyword", value: "contain" },
      { type: "keyword", value: "auto" },
      { type: "keyword", value: "auto" },
    ],
  });
  expect(
    parseCssValue("backgroundRepeat", `repeat, no-repeat, repeat, repeat`)
  ).toEqual({
    type: "layers",
    value: [
      { type: "keyword", value: "repeat" },
      { type: "keyword", value: "no-repeat" },
      { type: "keyword", value: "repeat" },
      { type: "keyword", value: "repeat" },
    ],
  });
});

test("parse background-attachment property as layers", () => {
  expect(
    parseCssValue("backgroundAttachment", `scroll, fixed, scroll, scroll`)
  ).toEqual({
    type: "layers",
    value: [
      { type: "keyword", value: "scroll" },
      { type: "keyword", value: "fixed" },
      { type: "keyword", value: "scroll" },
      { type: "keyword", value: "scroll" },
    ],
  });
});

test("parse repeated value with css wide keywords", () => {
  expect(parseCssValue("backgroundAttachment", "initial")).toEqual({
    type: "keyword",
    value: "initial",
  });
  expect(parseCssValue("backgroundAttachment", "INHERIT")).toEqual({
    type: "keyword",
    value: "inherit",
  });
  expect(parseCssValue("backgroundAttachment", "unset")).toEqual({
    type: "keyword",
    value: "unset",
  });
  expect(parseCssValue("backgroundAttachment", "revert")).toEqual({
    type: "keyword",
    value: "revert",
  });
  expect(parseCssValue("backgroundAttachment", "revert-layer")).toEqual({
    type: "keyword",
    value: "revert-layer",
  });
});

test("parse transition-property property", () => {
  expect(parseCssValue("transitionProperty", "none")).toEqual({
    type: "keyword",
    value: "none",
  });
  expect(parseCssValue("transitionProperty", "opacity, width, all")).toEqual({
    type: "layers",
    value: [
      { type: "unparsed", value: "opacity" },
      { type: "unparsed", value: "width" },
      { type: "keyword", value: "all" },
    ],
  });
  expect(parseCssValue("transitionProperty", "opacity, none, unknown")).toEqual(
    {
      type: "layers",
      value: [
        { type: "unparsed", value: "opacity" },
        { type: "unparsed", value: "none" },
        { type: "unparsed", value: "unknown" },
      ],
    }
  );
});

test("parse transition-duration property", () => {
  expect(parseCssValue("transitionDuration", `10ms, 10ms`)).toEqual({
    type: "layers",
    value: [
      { type: "unit", unit: "ms", value: 10 },
      { type: "unit", unit: "ms", value: 10 },
    ],
  });
  expect(parseCssValue("transitionDuration", `10ms, foo`)).toEqual({
    type: "invalid",
    value: "10ms, foo",
  });
});

test("parse transition-timing-function property", () => {
  const parsedValue = parseCssValue(
    "transitionTimingFunction",
    "ease, ease-in, cubic-bezier(0.68,-0.6,.32,1.6), steps(4, jump-start)"
  );
  expect(parsedValue).toEqual({
    type: "layers",
    value: [
      { type: "keyword", value: "ease" },
      { type: "keyword", value: "ease-in" },
      {
        type: "function",
        name: "cubic-bezier",
        args: {
          type: "layers",
          value: [
            { type: "keyword", value: "0.68" },
            { type: "keyword", value: "-0.6" },
            { type: "keyword", value: ".32" },
            { type: "keyword", value: "1.6" },
          ],
        },
      },
      {
        type: "function",
        name: "steps",
        args: {
          type: "layers",
          value: [
            { type: "keyword", value: "4" },
            { type: "keyword", value: "jump-start" },
          ],
        },
      },
    ],
  });
  expect(toValue(parsedValue)).toMatchInlineSnapshot(
    `"ease, ease-in, cubic-bezier(0.68, -0.6, .32, 1.6), steps(4, jump-start)"`
  );
  expect(parseCssValue("transitionTimingFunction", "ease, testing")).toEqual({
    type: "invalid",
    value: "ease, testing",
  });
});

test("parse transition-behavior property as layers", () => {
  expect(parseCssValue("transitionBehavior", `normal`)).toEqual({
    type: "layers",
    value: [{ type: "keyword", value: "normal" }],
  });
  expect(parseCssValue("transitionBehavior", `NORMAL, allow-discrete`)).toEqual(
    {
      type: "layers",
      value: [
        { type: "keyword", value: "normal" },
        { type: "keyword", value: "allow-discrete" },
      ],
    }
  );
  expect(parseCssValue("transitionBehavior", `normal, invalid`)).toEqual({
    type: "invalid",
    value: "normal, invalid",
  });
});

test("parse unknown properties as unparsed", () => {
  expect(parseCssValue("animationTimeline" as StyleProperty, "auto")).toEqual({
    type: "unparsed",
    value: "auto",
  });
  expect(
    parseCssValue("animationRangeStart" as StyleProperty, "normal")
  ).toEqual({
    type: "unparsed",
    value: "normal",
  });
  expect(parseCssValue("animationRangeEnd" as StyleProperty, "normal")).toEqual(
    {
      type: "unparsed",
      value: "normal",
    }
  );
});

test("parse transform property as tuple", () => {
  expect(
    parseCssValue("transform", "rotateX(45deg) rotateY(30deg) rotateZ(60deg)")
  ).toEqual({
    type: "tuple",
    value: [
      {
        type: "function",
        name: "rotateX",
        args: {
          type: "tuple",
          value: [{ type: "unit", value: 45, unit: "deg" }],
        },
      },
      {
        type: "function",
        name: "rotateY",
        args: {
          type: "tuple",
          value: [{ type: "unit", value: 30, unit: "deg" }],
        },
      },
      {
        type: "function",
        name: "rotateZ",
        args: {
          type: "tuple",
          value: [{ type: "unit", value: 60, unit: "deg" }],
        },
      },
    ],
  });

  expect(parseCssValue("transform", "skew(30deg, 20deg)")).toEqual({
    type: "tuple",
    value: [
      {
        type: "function",
        name: "skew",
        args: {
          type: "layers",
          value: [
            { type: "unit", value: 30, unit: "deg" },
            { type: "unit", value: 20, unit: "deg" },
          ],
        },
      },
    ],
  });

  expect(
    parseCssValue("transform", "translate3d(-100px, 50px, -150px)")
  ).toEqual({
    type: "tuple",
    value: [
      {
        type: "function",
        name: "translate3d",
        args: {
          type: "layers",
          value: [
            { type: "unit", value: -100, unit: "px" },
            { type: "unit", value: 50, unit: "px" },
            { type: "unit", value: -150, unit: "px" },
          ],
        },
      },
    ],
  });
});

test("parses transform values and returns invalid for invalid values", () => {
  expect(parseCssValue("transform", "scale(1.5, 50px)")).toEqual({
    type: "invalid",
    value: "scale(1.5, 50px)",
  });

  expect(parseCssValue("transform", "matrix(1, 0.5, -0.5, 1, 100)")).toEqual({
    type: "invalid",
    value: "matrix(1, 0.5, -0.5, 1, 100)",
  });
});

test("parses a valid translate value", () => {
  expect(parseCssValue("translate", "100px")).toEqual({
    type: "tuple",
    value: [
      {
        type: "unit",
        unit: "px",
        value: 100,
      },
    ],
  });

  expect(parseCssValue("translate", "100px 200px")).toEqual({
    type: "tuple",
    value: [
      {
        type: "unit",
        unit: "px",
        value: 100,
      },
      {
        type: "unit",
        unit: "px",
        value: 200,
      },
    ],
  });

  expect(parseCssValue("translate", "10em 10em 10em")).toEqual({
    type: "tuple",
    value: [
      {
        type: "unit",
        unit: "em",
        value: 10,
      },
      {
        type: "unit",
        unit: "em",
        value: 10,
      },
      {
        type: "unit",
        unit: "em",
        value: 10,
      },
    ],
  });
});

test("parses and returns invalid for invalid translate values", () => {
  expect(parseCssValue("translate", "foo bar")).toEqual({
    type: "invalid",
    value: "foo bar",
  });

  expect(parseCssValue("translate", "100px 200px 300px 400px")).toEqual({
    type: "invalid",
    value: "100px 200px 300px 400px",
  });

  expect(parseCssValue("translate", "100%, 200%")).toEqual({
    type: "invalid",
    value: "100%, 200%",
  });
});

test("parses a valid translate value", () => {
  expect(parseCssValue("scale", "1.5")).toEqual({
    type: "tuple",
    value: [
      {
        type: "unit",
        value: 1.5,
        unit: "number",
      },
    ],
  });

  expect(parseCssValue("scale", "5 10 15")).toEqual({
    type: "tuple",
    value: [
      {
        type: "unit",
        value: 5,
        unit: "number",
      },
      {
        type: "unit",
        value: 10,
        unit: "number",
      },
      {
        type: "unit",
        value: 15,
        unit: "number",
      },
    ],
  });

  expect(parseCssValue("scale", "50%")).toEqual({
    type: "tuple",
    value: [{ type: "unit", value: 50, unit: "%" }],
  });
});

test("throws error for invalid scale proeprty values", () => {
  expect(parseCssValue("scale", "10 foo")).toEqual({
    type: "invalid",
    value: "10 foo",
  });
  expect(parseCssValue("scale", "5 10 15 20")).toEqual({
    type: "invalid",
    value: "5 10 15 20",
  });
  expect(parseCssValue("scale", "5, 15")).toEqual({
    type: "invalid",
    value: "5, 15",
  });
  expect(parseCssValue("scale", "5px")).toEqual({
    type: "invalid",
    value: "5px",
  });
});
