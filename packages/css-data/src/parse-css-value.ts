import { colord } from "colord";
import * as csstree from "css-tree";
import type { CssNode } from "css-tree";
import warnOnce from "warn-once";
import {
  LayersValue,
  TupleValue,
  cssWideKeywords,
  hyphenateProperty,
  type LayerValueItem,
  type StyleProperty,
  type StyleValue,
  type Unit,
} from "@webstudio-is/css-engine";
import { keywordValues } from "./__generated__/keyword-values";
import { units } from "./__generated__/units";
import { parseTranslate } from "./property-parsers/translate";
import { parseTransform } from "./property-parsers/transform";
import { parseScale } from "./property-parsers/scale";
import { parseFilter } from "./property-parsers/filter";
import { parseShadow } from "./property-parsers/shadows";

export const cssTryParseValue = (input: string) => {
  try {
    const ast = csstree.parse(input, { context: "value" });
    return ast;
  } catch {
    return;
  }
};

const splitRepeated = (nodes: CssNode[]) => {
  const lists: Array<CssNode[]> = [[]];
  for (const node of nodes) {
    if (node.type === "Operator" && node.value === ",") {
      lists.push([]);
    } else {
      lists.at(-1)?.push(node);
    }
  }
  return lists;
};

// Because csstree parser has bugs we use CSSStyleValue to validate css properties if available
// and fall back to csstree.
export const isValidDeclaration = (
  property: string,
  value: string
): boolean => {
  const cssPropertyName = hyphenateProperty(property);

  // these properties have poor support natively and in csstree
  // though rendered styles are merged as shorthand
  // so validate artifically
  if (cssPropertyName === "white-space-collapse") {
    return keywordValues.whiteSpaceCollapse.includes(
      value as (typeof keywordValues.whiteSpaceCollapse)[0]
    );
  }
  if (cssPropertyName === "text-wrap-mode") {
    return keywordValues.textWrapMode.includes(
      value as (typeof keywordValues.textWrapMode)[0]
    );
  }
  if (cssPropertyName === "text-wrap-style") {
    return keywordValues.textWrapStyle.includes(
      value as (typeof keywordValues.textWrapStyle)[0]
    );
  }

  if (cssPropertyName === "transition-behavior") {
    return true;
  }

  // @todo remove after csstree fixes
  // - https://github.com/csstree/csstree/issues/246
  // - https://github.com/csstree/csstree/issues/164
  if (typeof CSSStyleValue !== "undefined") {
    try {
      CSSStyleValue.parse(cssPropertyName, value);
      return true;
    } catch {
      return false;
    }
  }

  const ast = cssTryParseValue(value);

  if (ast == null) {
    return false;
  }

  const matchResult = csstree.lexer.matchProperty(cssPropertyName, ast);

  // allow to parse unknown properties as unparsed
  if (matchResult.error?.message.includes("Unknown property")) {
    return true;
  }

  return matchResult.matched != null;
};

const repeatedProps = new Set<StyleProperty>([
  "backgroundAttachment",
  "backgroundClip",
  "backgroundBlendMode",
  "backgroundOrigin",
  "backgroundPositionX",
  "backgroundPositionY",
  "backgroundRepeat",
  "backgroundSize",
  "backgroundImage",
  "transitionProperty",
  "transitionDuration",
  "transitionDelay",
  "transitionTimingFunction",
  "transitionBehavior",
]);

export const parseCssValue = (
  property: StyleProperty, // Handles only long-hand values.
  input: string,
  topLevel = true
): StyleValue => {
  const potentialKeyword = input.toLowerCase().trim();
  if (cssWideKeywords.has(potentialKeyword)) {
    return { type: "keyword", value: potentialKeyword };
  }

  if (property === "transitionProperty" && potentialKeyword === "none") {
    if (topLevel) {
      return { type: "keyword", value: potentialKeyword };
    } else {
      // none is not valid layer keyword
      return { type: "unparsed", value: potentialKeyword };
    }
  }

  if (property === "scale") {
    return parseScale(input);
  }

  const invalidValue = {
    type: "invalid",
    value: input,
  } as const;

  if (input.length === 0) {
    return invalidValue;
  }

  if (isValidDeclaration(property, input) === false) {
    return invalidValue;
  }

  const ast = cssTryParseValue(input);

  if (ast == null) {
    warnOnce(
      true,
      `Can't parse css property "${property}" with value "${input}"`
    );
    return invalidValue;
  }

  if (property === "translate") {
    return parseTranslate(input);
  }

  if (property === "transform") {
    return parseTransform(input);
  }

  if (property === "filter" || property === "backdropFilter") {
    return parseFilter(property, input);
  }

  if (property === "boxShadow" || property === "textShadow") {
    return parseShadow(property, input);
  }

  // prevent infinite splitting into layers for items
  if (repeatedProps.has(property) && topLevel) {
    const nodes = "children" in ast ? ast.children?.toArray() ?? [] : [ast];
    let invalid = false;
    const layersValue: StyleValue = {
      type: "layers",
      value: splitRepeated(nodes).map((nodes) => {
        const value = csstree.generate({
          type: "Value",
          children: new csstree.List<CssNode>().fromArray(nodes),
        });
        const parsed = parseCssValue(property, value, false) as LayerValueItem;
        if (parsed.type === "invalid") {
          invalid = true;
        }
        return parsed;
      }),
    };
    // at least one layer is invalid then whole value is invalid
    if (invalid) {
      return invalidValue;
    }
    return layersValue;
  }

  // csstree does not support transition-behavior
  // so check keywords manually
  if (property === "transitionBehavior") {
    return keywordValues[property].includes(potentialKeyword as never)
      ? { type: "keyword", value: potentialKeyword }
      : invalidValue;
  }

  if (property === "transitionTimingFunction") {
    const node = ast.type === "Value" ? ast.children.first : ast;
    if (node?.type === "Identifier") {
      return { type: "keyword", value: node.name };
    }
    if (node?.type === "Function") {
      // transition timing function arguments are comma seperated values
      const args: LayersValue = { type: "layers", value: [] };
      for (const arg of node.children) {
        if (arg.type === "Number") {
          args.value.push({ type: "keyword", value: arg.value });
        }
        if (arg.type === "Identifier") {
          args.value.push({ type: "keyword", value: arg.name });
        }
        if (arg.type === "Dimension") {
          const unit = arg.unit as Unit;
          args.value.push({ type: "unit", value: Number(arg.value), unit });
        }
      }
      return { type: "function", args, name: node.name };
    }
  }

  if (ast.type === "Value" && ast.children.first === ast.children.last) {
    // Try extract units from 1st children
    const first = ast.children.first;

    if (first?.type === "Number") {
      return {
        type: "unit",
        unit: "number",
        value: Number(first.value),
      };
    }

    if (first?.type === "Dimension") {
      const unit = first.unit as (typeof units)[keyof typeof units][number];

      for (const unitGroup of Object.values(units)) {
        if (unitGroup.includes(unit as never)) {
          return {
            type: "unit",
            unit: unit as Unit,
            value: Number(first.value),
          };
        }
      }
      return invalidValue;
    }

    if (first?.type === "Percentage") {
      return {
        type: "unit",
        unit: "%",
        value: Number(first.value),
      };
    }

    if (first?.type === "Identifier") {
      const values = keywordValues[property as keyof typeof keywordValues];
      if (values === undefined) {
        return {
          type: "unparsed",
          value: input,
        };
      }
      const lettersRegex = /[^a-zA-Z]+/g;
      const searchValues = values.map((value) =>
        value.replace(lettersRegex, "").toLowerCase()
      );
      const keywordInput = input.replace(lettersRegex, "").toLowerCase();

      const index = searchValues.indexOf(keywordInput);

      if (index > -1) {
        return {
          type: "keyword",
          value: values[index]!,
        };
      }
    }

    if (first?.type === "Url") {
      return {
        type: "image",
        value: {
          type: "url",
          url: first.value,
        },
      };
    }
  }

  // Probably a color (we can use csstree.lexer.matchProperty(cssPropertyName, ast) to extract the type but this looks much simpler)
  if (property.toLocaleLowerCase().includes("color")) {
    const mayBeColor = colord(input);
    if (mayBeColor.isValid()) {
      const rgb = mayBeColor.toRgb();
      return {
        type: "rgb",
        alpha: rgb.a,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
      };
    }
  }

  // Probably a tuple like background-position
  if (ast.type === "Value" && ast.children.size === 2) {
    const tupleFirst = parseCssValue(
      property,
      csstree.generate(ast.children.first!),
      false
    );
    const tupleLast = parseCssValue(
      property,
      csstree.generate(ast.children.last!),
      false
    );

    const tupleResult = TupleValue.safeParse({
      type: "tuple",
      value: [tupleFirst, tupleLast],
    });

    if (tupleResult.success) {
      return tupleResult.data;
    }
  }

  return {
    type: "unparsed",
    value: input,
  };
};
