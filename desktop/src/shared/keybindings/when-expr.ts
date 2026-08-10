import type { ContextKeyValues, WhenExpr } from "./types";

type Token =
  | { kind: "ident"; value: string }
  | { kind: "string"; value: string }
  | { kind: "op"; value: "&&" | "||" | "==" | "!=" | "!" | "(" | ")" };

interface Parser {
  tokens: Token[];
  index: number;
  values: ContextKeyValues;
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (input.startsWith("&&", i)) {
      tokens.push({ kind: "op", value: "&&" });
      i += 2;
      continue;
    }
    if (input.startsWith("||", i)) {
      tokens.push({ kind: "op", value: "||" });
      i += 2;
      continue;
    }
    if (input.startsWith("==", i)) {
      tokens.push({ kind: "op", value: "==" });
      i += 2;
      continue;
    }
    if (input.startsWith("!=", i)) {
      tokens.push({ kind: "op", value: "!=" });
      i += 2;
      continue;
    }
    if (ch === "!") {
      tokens.push({ kind: "op", value: "!" });
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        value += input[i];
        i += 1;
      }
      if (input[i] !== quote) return null;
      i += 1;
      tokens.push({ kind: "string", value });
      continue;
    }
    if (/[a-zA-Z_.]/.test(ch)) {
      let value = "";
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i]!)) {
        value += input[i];
        i += 1;
      }
      tokens.push({ kind: "ident", value });
      continue;
    }
    return null;
  }
  return tokens;
}

function peek(p: Parser): Token | undefined {
  return p.tokens[p.index];
}

function take(p: Parser): Token | undefined {
  return p.tokens[p.index++];
}

function truthy(value: string | boolean | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  return value !== "";
}

function parseOr(p: Parser): boolean | null {
  let left = parseAnd(p);
  if (left === null) return null;
  while (peek(p)?.kind === "op" && peek(p)?.value === "||") {
    take(p);
    const right = parseAnd(p);
    if (right === null) return null;
    left = left || right;
  }
  return left;
}

function parseAnd(p: Parser): boolean | null {
  let left = parseUnary(p);
  if (left === null) return null;
  while (peek(p)?.kind === "op" && peek(p)?.value === "&&") {
    take(p);
    const right = parseUnary(p);
    if (right === null) return null;
    left = left && right;
  }
  return left;
}

function parseUnary(p: Parser): boolean | null {
  if (peek(p)?.kind === "op" && peek(p)?.value === "!") {
    take(p);
    const inner = parseUnary(p);
    if (inner === null) return null;
    return !inner;
  }
  return parsePrimary(p);
}

function parsePrimary(p: Parser): boolean | null {
  const token = take(p);
  if (!token) return null;

  if (token.kind === "op" && token.value === "(") {
    const inner = parseOr(p);
    if (inner === null) return null;
    const close = take(p);
    if (!(close?.kind === "op" && close.value === ")")) return null;
    return inner;
  }

  if (token.kind !== "ident") return null;

  const next = peek(p);
  if (next?.kind === "op" && (next.value === "==" || next.value === "!=")) {
    take(p);
    const rhs = take(p);
    if (!rhs || (rhs.kind !== "string" && rhs.kind !== "ident")) return null;
    const left = p.values[token.value];
    const right =
      rhs.kind === "string" ? rhs.value : String(p.values[rhs.value] ?? "");
    const equal = String(left ?? "") === right;
    return next.value === "==" ? equal : !equal;
  }

  return truthy(p.values[token.value]);
}

export function evaluateWhen(
  expr: WhenExpr | undefined,
  values: ContextKeyValues,
): boolean {
  if (!expr || expr.trim() === "") return true;
  const tokens = tokenize(expr);
  if (!tokens) return false;

  const parser: Parser = { tokens, index: 0, values };
  const result = parseOr(parser);
  if (result === null) return false;
  if (parser.index !== parser.tokens.length) return false;
  return result;
}

/** Static may-both-be-true check for conflict detection (boolean keys + string equality). */
export function whenExprsMayBothBeTrue(
  a: WhenExpr | undefined,
  b: WhenExpr | undefined,
): boolean {
  if (!a || !b) return true;
  if (a.trim() === b.trim()) return true;

  const normalize = (expr: string) => expr.replace(/\s+/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === `!${nb}` || nb === `!${na}`) return false;

  const eq = /^([a-zA-Z0-9_.]+)=='([^']+)'$/;
  const neq = /^([a-zA-Z0-9_.]+)!='([^']+)'$/;
  const ma = na.match(eq);
  const mb = nb.match(eq);
  if (ma && mb && ma[1] === mb[1] && ma[2] !== mb[2]) return false;

  const maEq = na.match(eq);
  const mbNeq = nb.match(neq);
  if (maEq && mbNeq && maEq[1] === mbNeq[1] && maEq[2] === mbNeq[2]) {
    return false;
  }
  const mbEq = nb.match(eq);
  const maNeq = na.match(neq);
  if (mbEq && maNeq && mbEq[1] === maNeq[1] && mbEq[2] === maNeq[2]) {
    return false;
  }

  return true;
}

export function whenSpecificity(expr: WhenExpr | undefined): number {
  if (!expr || !expr.trim()) return 0;
  return expr.split("&&").length;
}
