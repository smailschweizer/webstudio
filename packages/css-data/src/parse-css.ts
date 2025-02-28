import { camelCase } from "change-case";
import * as csstree from "css-tree";
import { StyleValue, type StyleProperty } from "@webstudio-is/css-engine";
import { parseCssValue as parseCssValueLonghand } from "./parse-css-value";
import { expandShorthands } from "./shorthands";

export type ParsedStyleDecl = {
  breakpoint?: string;
  selector: string;
  state?: string;
  property: StyleProperty;
  value: StyleValue;
};

/**
 * Store prefixed properties without change
 * and convert to camel case only unprefixed properties
 * @todo stop converting to camel case and use hyphenated format
 */
const normalizePropertyName = (property: string) => {
  // these are manually added with pascal case
  // convert unprefixed used by webflow version into prefixed one
  if (property === "-webkit-font-smoothing" || property === "font-smoothing") {
    return "WebkitFontSmoothing";
  }
  if (property === "-moz-osx-font-smoothing") {
    return "MozOsxFontSmoothing";
  }
  // webflow use unprefixed version
  if (property === "tap-highlight-color") {
    return "-webkit-tap-highlight-color";
  }
  if (property.startsWith("-")) {
    return property;
  }
  return camelCase(property);
};

// @todo we don't parse correctly most of them if not all
const prefixedProperties = [
  "-webkit-box-orient",
  "-webkit-line-clamp",
  "-webkit-font-smoothing",
  "-moz-osx-font-smoothing",
  "-webkit-tap-highlight-color",
  "-webkit-overflow-scrolling",
];
const prefixes = ["webkit", "moz", "ms", "o"];
const prefixRegex = new RegExp(`^-(${prefixes.join("|")})-`);

const unprefixProperty = (property: string) => {
  if (prefixedProperties.includes(property)) {
    return property;
  }
  return property.replace(prefixRegex, "");
};

const parseCssValue = (
  property: string,
  value: string
): Map<StyleProperty, StyleValue> => {
  const expanded = new Map(expandShorthands([[property, value]]));
  const final = new Map();
  for (const [property, value] of expanded) {
    if (value === "") {
      // Keep the browser behavior when property is defined with an empty value e.g. `color:;`
      // It may override some existing value and effectively set it to "unset";
      final.set(property, { type: "keyword", value: "unset" });
      continue;
    }

    // @todo https://github.com/webstudio-is/webstudio/issues/3399
    if (value.startsWith("var(")) {
      final.set(property, { type: "keyword", value: "unset" });
      continue;
    }

    final.set(
      property,
      parseCssValueLonghand(
        normalizePropertyName(property) as StyleProperty,
        value
      )
    );
  }
  return final;
};

const cssTreeTryParse = (input: string) => {
  try {
    const ast = csstree.parse(input);
    return ast;
  } catch {
    return;
  }
};

type Selector = {
  name: string;
  state?: string;
};

export const parseCss = (css: string) => {
  const ast = cssTreeTryParse(css);
  const styles = new Map<string, ParsedStyleDecl>();

  if (ast === undefined) {
    return [];
  }

  csstree.walk(ast, function (node) {
    if (node.type !== "Declaration" || this.rule?.prelude.type === undefined) {
      return;
    }

    if (this.atrule && this.atrule.name !== "media") {
      return;
    }

    const supportedMediaFeatures = ["min-width", "max-width"];
    const supportedUnits = ["px"];
    let breakpoint: undefined | string;
    let invalidBreakpoint = false;
    if (this.atrule?.prelude?.type === "AtrulePrelude") {
      csstree.walk(this.atrule.prelude, {
        enter: (node, item, list) => {
          if (node.type === "Identifier") {
            if (
              node.name === "screen" ||
              node.name === "all" ||
              node.name === "and"
            ) {
              list.remove(item);
            }
            // prevent saving print styles
            if (node.name === "print") {
              invalidBreakpoint = true;
            }
          }
          if (
            node.type === "MediaFeature" &&
            supportedMediaFeatures.includes(node.name) === false
          ) {
            invalidBreakpoint = true;
          }
          if (
            node.type === "Dimension" &&
            supportedUnits.includes(node.unit) === false
          ) {
            invalidBreakpoint = true;
          }
        },
        leave: (node) => {
          // complex media queries are not supported yet
          if (node.type === "MediaQuery" && node.children.size > 1) {
            invalidBreakpoint = true;
          }
        },
      });
      const generated = csstree.generate(this.atrule.prelude);
      if (generated) {
        breakpoint = generated;
      }
    }
    if (invalidBreakpoint) {
      return;
    }

    const selectors: Selector[] = [];
    csstree.walk(this.rule.prelude, (node, item) => {
      if (node.type !== "ClassSelector" && node.type !== "TypeSelector") {
        return;
      }
      // We don't support nesting yet.
      if (
        (item?.prev && item.prev.data.type === "Combinator") ||
        (item?.next && item.next.data.type === "Combinator")
      ) {
        return;
      }

      if (item?.next && item.next.data.type === "PseudoElementSelector") {
        selectors.push({
          name: node.name,
          state: `::${item.next.data.name}`,
        });
      } else if (item?.next && item.next.data.type === "PseudoClassSelector") {
        selectors.push({
          name: node.name,
          state: `:${item.next.data.name}`,
        });
      } else {
        selectors.push({
          name: node.name,
        });
      }
    });

    const stringValue = csstree.generate(node.value);

    const parsedCss = parseCssValue(
      unprefixProperty(node.property),
      stringValue
    );

    for (const { name: selector, state } of selectors) {
      for (const [property, value] of parsedCss) {
        const styleDecl: ParsedStyleDecl = {
          selector,
          property: normalizePropertyName(
            unprefixProperty(property)
          ) as StyleProperty,
          value,
        };
        if (breakpoint) {
          styleDecl.breakpoint = breakpoint;
        }
        if (state) {
          styleDecl.state = state;
        }

        // deduplicate styles within selector and state by using map
        styles.set(`${breakpoint}:${selector}:${state}:${property}`, styleDecl);
      }
    }
  });

  return Array.from(styles.values());
};

type ParsedBreakpoint = {
  minWidth?: number;
  maxWidth?: number;
};

export const parseMediaQuery = (
  mediaQuery: string
): undefined | ParsedBreakpoint => {
  const ast = csstree.parse(mediaQuery, { context: "mediaQuery" });
  let property: undefined | "minWidth" | "maxWidth";
  let value: undefined | number;
  csstree.walk(ast, (node) => {
    if (node.type === "MediaFeature") {
      if (node.name === "min-width") {
        property = "minWidth";
      }
      if (node.name === "max-width") {
        property = "maxWidth";
      }
    }
    if (node.type === "Dimension" && node.unit === "px") {
      value = Number(node.value);
    }
  });
  if (property === undefined || value === undefined) {
    return;
  }
  return {
    [property]: value,
  };
};
