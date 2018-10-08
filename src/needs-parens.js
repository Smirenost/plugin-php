"use strict";

const assert = require("assert");

const { getPrecedence, shouldFlatten, isBitwiseOperator } = require("./util");

function needsParens(path) {
  const parent = path.getParentNode();

  if (!parent) {
    return false;
  }

  const name = path.getName();
  const node = path.getNode();

  if (
    [
      //  No need parens for top level children of this nodes
      "program",
      "namespace",
      "declare",
      "block",

      // No need parens
      "include",
      "print",
      "return",
      "echo"
    ].includes(parent.kind)
  ) {
    return false;
  }

  // Avoid parens in short control structures like `if (expr) statement`
  if (
    ["if", "while", "for", "foreach"].includes(parent.kind) &&
    (parent.body === node || parent.alternate === node)
  ) {
    return false;
  }

  switch (node.kind) {
    case "pre":
    case "post":
      if (parent.kind === "unary") {
        return (
          node.kind === "pre" &&
          ((node.type === "+" && parent.type === "+") ||
            (node.type === "-" && parent.type === "-"))
        );
      }
    // else fallthrough
    case "unary":
      switch (parent.kind) {
        case "unary":
          return (
            node.type === parent.type &&
            (node.type === "+" || node.type === "-")
          );
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
        case "call":
          return name === "what" && parent.what === node;
        case "bin":
          return parent.type === "**" && name === "left";
        default:
          return false;
      }
    case "bin": {
      switch (parent.kind) {
        case "assign":
          return ["and", "xor", "or"].includes(node.type);
        case "silent":
        case "cast":
          // TODO: bug https://github.com/glayzzle/php-parser/issues/172
          return node.parenthesizedExpression;
        case "pre":
        case "post":
        case "unary":
          return true;
        case "call":
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
          return name === "what" && parent.what === node;
        case "bin": {
          const po = parent.type;
          const pp = getPrecedence(po);
          const no = node.type;
          const np = getPrecedence(no);

          if (pp > np) {
            return true;
          }

          if (po === "||" && no === "&&") {
            return true;
          }

          if (pp === np && name === "right") {
            assert.strictEqual(parent.right, node);

            return true;
          }

          if (pp === np && !shouldFlatten(po, no)) {
            return true;
          }

          if (pp < np && no === "%") {
            return !shouldFlatten(po, no);
          }

          // Add parenthesis when working with binary operators
          // It's not stricly needed but helps with code understanding
          if (isBitwiseOperator(po)) {
            return true;
          }

          return false;
        }

        default:
          return false;
      }
    }
    case "clone":
    case "new": {
      switch (parent.kind) {
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
        case "call":
          return name === "what" && parent.what === node;
        default:
          return false;
      }
    }
    case "yield": {
      switch (parent.kind) {
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
        case "call":
          return name === "what" && parent.what === node;

        case "retif":
          return parent.test === node;

        default:
          return !!(node.key || node.value);
      }
    }
    case "assign": {
      if (
        parent.kind === "for" &&
        (parent.init.includes(node) || parent.increment.includes(node))
      ) {
        return false;
      } else if (parent.kind === "while" && node.left.kind === "list") {
        return false;
      } else if (parent.kind === "assign") {
        return false;
      } else if (parent.kind === "static") {
        return false;
      }

      return true;
    }
    case "retif":
      switch (parent.kind) {
        case "unary":
        case "bin":
        case "retif":
          if (name === "test" && !parent.trueExpr) {
            return false;
          }

          return true;
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
        case "call":
          return name === "what" && parent.what === node;

        default:
          return false;
      }
    case "closure":
      return parent.kind === "call" && name === "what" && parent.what === node;
    case "silence":
    case "cast":
      // TODO: bug https://github.com/glayzzle/php-parser/issues/172
      return node.parenthesizedExpression;
    // else fallthrough
    case "string":
    case "array":
      switch (parent.kind) {
        case "propertylookup":
        case "staticlookup":
        case "offsetlookup":
        case "call":
          if (
            ["string", "array"].includes(node.kind) &&
            parent.kind === "offsetlookup"
          ) {
            return false;
          }

          return name === "what" && parent.what === node;
        default:
          return false;
      }
    case "print":
    case "include":
      return parent.kind === "bin";
  }

  return false;
}

module.exports = needsParens;
