import { Messages } from "../../messages.js";

export class ExpressionError extends Error {
  public constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "left"
  | "right"
  | "comma"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
}

const PRECEDENCE: Readonly<Record<string, number>> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  ">": 4,
  ">=": 4,
  "<": 4,
  "<=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "^": 7,
};

class Lexer {
  private offset = 0;

  public constructor(private readonly source: string) {}

  public next(): Token {
    while (/\s/u.test(this.source[this.offset] ?? "")) this.offset += 1;
    const start = this.offset;
    const char = this.source[this.offset];
    if (char === undefined) return { kind: "eof", text: "", offset: start };
    switch (char) {
      case "(":
        this.offset += 1;
        return { kind: "left", text: char, offset: start };
      case ")":
        this.offset += 1;
        return { kind: "right", text: char, offset: start };
      case ",":
        this.offset += 1;
        return { kind: "comma", text: char, offset: start };
    }

    if (char === '"' || char === "'") {
      const quote = char;
      this.offset += 1;
      let value = "";
      while (this.offset < this.source.length) {
        const current = this.source[this.offset];
        this.offset += 1;
        if (current === quote)
          return { kind: "string", text: value, offset: start };
        if (current === "\\") {
          const escaped = this.source[this.offset];
          this.offset += 1;
          value +=
            escaped === "n" ? "\n" : escaped === "t" ? "\t" : (escaped ?? "");
        } else {
          value += current;
        }
      }
      throw new ExpressionError(
        Messages.src.config.expression.evaluator.text0001,
        start,
      );
    }

    const number = this.source
      .slice(this.offset)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[dDfFlL]?/u)?.[0];
    if (number) {
      this.offset += number.length;
      return { kind: "number", text: number, offset: start };
    }
    const identifier = this.source
      .slice(this.offset)
      .match(/^[A-Za-z_][A-Za-z0-9_.]*/u)?.[0];
    if (identifier) {
      this.offset += identifier.length;
      return { kind: "identifier", text: identifier, offset: start };
    }
    const operator = [
      ">=",
      "<=",
      "==",
      "!=",
      "&&",
      "||",
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "!",
      ">",
      "<",
    ].find((candidate) => this.source.startsWith(candidate, this.offset));
    if (operator) {
      this.offset += operator.length;
      return { kind: "operator", text: operator, offset: start };
    }
    throw new ExpressionError(
      Messages.src.config.expression.evaluator.text0002(char),
      start,
    );
  }
}

export function expressionTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0 && value !== "false";
  return value !== null && value !== undefined;
}

function numeric(value: unknown, offset: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number))
    throw new ExpressionError(
      Messages.src.config.expression.evaluator.text0003(String(value)),
      offset,
    );
  return number;
}

const FUNCTIONS: Readonly<Record<string, (...values: number[]) => number>> = {
  ABS: Math.abs,
  CEIL: Math.ceil,
  FLOOR: Math.floor,
  MAX: Math.max,
  MIN: Math.min,
  POW: Math.pow,
  ROUND: Math.round,
  SQRT: Math.sqrt,
};

class Parser {
  private token: Token;

  public constructor(
    private readonly lexer: Lexer,
    private readonly variables: Readonly<Record<string, unknown>>,
  ) {
    this.token = lexer.next();
  }

  public parse(): unknown {
    const value = this.expression(0);
    if (this.token.kind !== "eof")
      throw new ExpressionError(
        Messages.src.config.expression.evaluator.text0004(this.token.text),
        this.token.offset,
      );
    return value;
  }

  private advance(): Token {
    const current = this.token;
    this.token = this.lexer.next();
    return current;
  }

  private expression(minimumPrecedence: number): unknown {
    let left = this.prefix();
    while (this.token.kind === "operator") {
      const precedence = PRECEDENCE[this.token.text];
      if (precedence === undefined || precedence < minimumPrecedence) break;
      const operator = this.advance();
      const right = this.expression(
        precedence + (operator.text === "^" ? 0 : 1),
      );
      left = this.binary(operator, left, right);
    }
    return left;
  }

  private prefix(): unknown {
    const current = this.advance();
    if (current.kind === "number")
      return Number(current.text.replace(/[dDfFlL]$/u, ""));
    if (current.kind === "string") return current.text;
    if (current.kind === "left") {
      const value = this.expression(0);
      if (this.token.kind !== "right")
        throw new ExpressionError(
          Messages.src.config.expression.evaluator.text0005,
          this.token.offset,
        );
      this.advance();
      return value;
    }
    if (current.kind === "operator" && ["!", "-", "+"].includes(current.text)) {
      const value = this.expression(8);
      if (current.text === "!") return !expressionTruthy(value);
      return current.text === "-"
        ? -numeric(value, current.offset)
        : numeric(value, current.offset);
    }
    if (current.kind === "identifier") {
      const upper = current.text.toUpperCase();
      if (upper === "TRUE") return true;
      if (upper === "FALSE") return false;
      if (upper === "NULL") return null;
      if (this.token.kind === "left") return this.call(current);
      if (Object.prototype.hasOwnProperty.call(this.variables, current.text))
        return this.variables[current.text];
      throw new ExpressionError(
        Messages.src.config.expression.evaluator.text0006(current.text),
        current.offset,
      );
    }
    throw new ExpressionError(
      Messages.src.config.expression.evaluator.text0007(current.text),
      current.offset,
    );
  }

  private call(identifier: Token): unknown {
    this.advance();
    const parameters: unknown[] = [];
    if (this.token.kind !== "right") {
      while (true) {
        parameters.push(this.expression(0));
        if (this.token.kind !== "comma") break;
        this.advance();
      }
    }
    if (this.token.kind !== "right")
      throw new ExpressionError(
        Messages.src.config.expression.evaluator.text0008,
        this.token.offset,
      );
    this.advance();
    const name = identifier.text.toUpperCase();
    if (name === "IF") {
      if (parameters.length !== 3)
        throw new ExpressionError(
          Messages.src.config.expression.evaluator.text0009,
          identifier.offset,
        );
      return expressionTruthy(parameters[0]) ? parameters[1] : parameters[2];
    }
    const implementation = FUNCTIONS[name];
    if (!implementation)
      throw new ExpressionError(
        Messages.src.config.expression.evaluator.text0010(identifier.text),
        identifier.offset,
      );
    return implementation(
      ...parameters.map((value) => numeric(value, identifier.offset)),
    );
  }

  private binary(operator: Token, left: unknown, right: unknown): unknown {
    switch (operator.text) {
      case "||":
        return expressionTruthy(left) || expressionTruthy(right);
      case "&&":
        return expressionTruthy(left) && expressionTruthy(right);
      case "==":
        return left === right || String(left) === String(right);
      case "!=":
        return !(left === right || String(left) === String(right));
      case ">":
        return numeric(left, operator.offset) > numeric(right, operator.offset);
      case ">=":
        return (
          numeric(left, operator.offset) >= numeric(right, operator.offset)
        );
      case "<":
        return numeric(left, operator.offset) < numeric(right, operator.offset);
      case "<=":
        return (
          numeric(left, operator.offset) <= numeric(right, operator.offset)
        );
      case "+":
        return typeof left === "string" || typeof right === "string"
          ? `${String(left)}${String(right)}`
          : numeric(left, operator.offset) + numeric(right, operator.offset);
      case "-":
        return numeric(left, operator.offset) - numeric(right, operator.offset);
      case "*":
        return numeric(left, operator.offset) * numeric(right, operator.offset);
      case "/":
        return numeric(left, operator.offset) / numeric(right, operator.offset);
      case "%":
        return numeric(left, operator.offset) % numeric(right, operator.offset);
      case "^":
        return (
          numeric(left, operator.offset) ** numeric(right, operator.offset)
        );
      default:
        throw new ExpressionError(
          Messages.src.config.expression.evaluator.text0011(operator.text),
          operator.offset,
        );
    }
  }
}

export function evaluateExpression(
  source: string,
  variables: Readonly<Record<string, unknown>> = {},
): unknown {
  return new Parser(new Lexer(source), variables).parse();
}
