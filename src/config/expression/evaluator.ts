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
  "|": 1,
  "&&": 2,
  "&": 2,
  "=": 3,
  "==": 3,
  "!=": 3,
  "<>": 3,
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

    if (char === '"') {
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
          if (escaped === "u") {
            const unicode = this.source.slice(this.offset, this.offset + 4);
            if (!/^[\da-fA-F]{4}$/u.test(unicode))
              throw new ExpressionError("Unicode 转义必须包含四位十六进制数字", start);
            this.offset += 4;
            value += String.fromCharCode(Number.parseInt(unicode, 16));
          } else {
            value +=
              escaped === "n"
                ? "\n"
                : escaped === "r"
                  ? "\r"
                  : escaped === "t"
                    ? "\t"
                    : escaped === "b"
                      ? "\b"
                      : escaped === "f"
                        ? "\f"
                        : escaped === '"' || escaped === "\\"
                          ? escaped
                          : (() => {
                              throw new ExpressionError(
                                `不支持的字符串转义 \\${escaped ?? ""}`,
                                this.offset - 2,
                              );
                            })();
          }
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
      .match(
        /^(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)/u,
      )?.[0];
    if (number) {
      this.offset += number.length;
      return { kind: "number", text: number, offset: start };
    }
    const identifier = this.source
      .slice(this.offset)
      .match(/^[\p{L}_][\p{L}\p{N}_]*/u)?.[0];
    if (identifier) {
      this.offset += identifier.length;
      const keyword = identifier.toUpperCase();
      if (keyword === "AND")
        return { kind: "operator", text: "&&", offset: start };
      if (keyword === "OR")
        return { kind: "operator", text: "||", offset: start };
      if (keyword === "NOT")
        return { kind: "operator", text: "!", offset: start };
      return { kind: "identifier", text: identifier, offset: start };
    }
    const operator = [
      ">=",
      "<=",
      "==",
      "!=",
      "<>",
      "&&",
      "||",
      "=",
      "&",
      "|",
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
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0 && value !== "false";
  return value !== null && value !== undefined;
}

function numeric(value: unknown, offset: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const number = Number(value);
    if (!Number.isNaN(number)) return number;
  }
  throw new ExpressionError(
    Messages.src.config.expression.evaluator.text0003(String(value)),
    offset,
  );
}

const UNARY_FUNCTIONS: Readonly<Record<string, (value: number) => number>> = {
  ABS: Math.abs,
  ACOS: Math.acos,
  ACOSH: Math.acosh,
  ACOT: (value) => Math.atan(1 / value),
  ACOTH: (value) => Math.atanh(1 / value),
  ASIN: Math.asin,
  ASINH: Math.asinh,
  ATAN: Math.atan,
  ATANH: Math.atanh,
  CBRT: Math.cbrt,
  CEIL: Math.ceil,
  CEILING: Math.ceil,
  COS: Math.cos,
  COSH: Math.cosh,
  COT: (value) => 1 / Math.tan(value),
  COTH: (value) => 1 / Math.tanh(value),
  CSC: (value) => 1 / Math.sin(value),
  CSCH: (value) => 1 / Math.sinh(value),
  DEG: (value) => (value * 180) / Math.PI,
  EXP: Math.exp,
  FLOOR: Math.floor,
  IS_FINITE: (value) => (Number.isFinite(value) ? 1 : 0),
  IS_NAN: (value) => (Number.isNaN(value) ? 1 : 0),
  LN: Math.log,
  LOG: Math.log,
  LOG10: Math.log10,
  NOT: (value) => (value === 0 ? 1 : 0),
  RAD: (value) => (value * Math.PI) / 180,
  SEC: (value) => 1 / Math.cos(value),
  SECH: (value) => 1 / Math.cosh(value),
  SIGN: Math.sign,
  SIGNUM: Math.sign,
  SIN: Math.sin,
  SINH: Math.sinh,
  SQRT: Math.sqrt,
  TAN: Math.tan,
  TANH: Math.tanh,
};

class Parser {
  private token: Token;

  public constructor(
    private readonly lexer: Lexer,
    private readonly variables: Readonly<Record<string, unknown>>,
    private readonly allowUnknownVariables = false,
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
    if (typeof value === "string" || value === null)
      throw new ExpressionError("表达式最终结果必须是数值", 0);
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
    if (current.kind === "number") {
      const normalized = current.text.replaceAll("_", "");
      return /^0[xX]/u.test(normalized)
        ? Number.parseInt(normalized.slice(2), 16)
        : Number(normalized);
    }
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
      // Sparrow 中幂运算优先于一元符号，因此 -2^2 等于 -(2^2)。
      const value = this.expression(7);
      if (current.text === "!") return expressionTruthy(value) ? 0 : 1;
      return current.text === "-"
        ? -numeric(value, current.offset)
        : numeric(value, current.offset);
    }
    if (current.kind === "identifier") {
      const upper = current.text.toUpperCase();
      if (upper === "TRUE") return 1;
      if (upper === "FALSE") return 0;
      if (upper === "PI") return Math.PI;
      if (upper === "E") return Math.E;
      if (this.token.kind === "left") return this.call(current);
      if (Object.prototype.hasOwnProperty.call(this.variables, current.text))
        return this.variables[current.text];
      if (this.allowUnknownVariables) return 0;
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
      const result = expressionTruthy(parameters[0])
        ? parameters[1]
        : parameters[2];
      return numeric(result, identifier.offset);
    }
    return this.callBuiltIn(name, parameters, identifier);
  }

  private callBuiltIn(
    name: string,
    parameters: readonly unknown[],
    identifier: Token,
  ): unknown {
    const numbers = (): number[] =>
      parameters.map((value) => numeric(value, identifier.offset));
    const arity = (...allowed: readonly number[]): void => {
      if (!allowed.includes(parameters.length))
        throw new ExpressionError(
          `函数 ${name} 的参数数量应为 ${allowed.join(" 或 ")}，实际为 ${parameters.length}`,
          identifier.offset,
        );
    };
    const stringValue = (index: number): string | null => {
      const value = parameters[index];
      if (value === null || value === undefined) return null;
      if (typeof value === "string") return value;
      if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
      )
        return value.toString();
      throw new ExpressionError(
        `${name} 需要字符串参数`,
        identifier.offset,
      );
    };
    const integer = (value: number): number => {
      if (!Number.isInteger(value) || value < 0)
        throw new ExpressionError(`${name} 需要非负整数参数`, identifier.offset);
      return value;
    };

    const unary = UNARY_FUNCTIONS[name];
    if (unary) {
      arity(1);
      return unary(numeric(parameters[0], identifier.offset));
    }
    switch (name) {
      case "SUM": {
        if (parameters.length === 0) arity(1);
        return numbers().reduce((sum, value) => sum + value, 0);
      }
      case "AVERAGE":
      case "AVG": {
        if (parameters.length === 0) arity(1);
        const values = numbers();
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      }
      case "MIN":
      case "MAX": {
        if (parameters.length === 0) arity(1);
        return name === "MIN" ? Math.min(...numbers()) : Math.max(...numbers());
      }
      case "POW":
        arity(2);
        return numeric(parameters[0], identifier.offset) ** numeric(parameters[1], identifier.offset);
      case "ATAN2":
        arity(2);
        return Math.atan2(...(numbers() as [number, number]));
      case "HYPOT":
        arity(2);
        return Math.hypot(...numbers());
      case "ROUND": {
        arity(1, 2);
        const value = numeric(parameters[0], identifier.offset);
        if (parameters.length === 1) return Math.round(value);
        const scale = integer(numeric(parameters[1], identifier.offset));
        const factor = 10 ** scale;
        return Math.round(value * factor) / factor;
      }
      case "FACT":
      case "FACTORIAL": {
        arity(1);
        const value = integer(numeric(parameters[0], identifier.offset));
        if (value > 170)
          throw new ExpressionError(`${name} 只支持 0 到 170`, identifier.offset);
        let result = 1;
        for (let current = 2; current <= value; current += 1) result *= current;
        return result;
      }
      case "CLAMP": {
        arity(3);
        const [value, min, max] = numbers();
        return Math.min(Math.max(value!, min!), max!);
      }
      case "LERP": {
        arity(3);
        const [start, end, amount] = numbers();
        return start! + (end! - start!) * amount!;
      }
      case "INVERSE_LERP": {
        arity(3);
        const [start, end, value] = numbers();
        return (value! - start!) / (end! - start!);
      }
      case "SMOOTHSTEP": {
        arity(3);
        const [edge0, edge1, value] = numbers();
        const amount = Math.min(
          1,
          Math.max(0, (value! - edge0!) / (edge1! - edge0!)),
        );
        return amount * amount * (3 - 2 * amount);
      }
      case "FMA": {
        arity(3);
        const [a, b, c] = numbers();
        return a! * b! + c!;
      }
      case "APPROX_EQ": {
        arity(3);
        const [a, b, epsilon] = numbers();
        return Math.abs(a! - b!) <= epsilon! ? 1 : 0;
      }
      case "RANDOM": {
        arity(0, 2);
        if (parameters.length === 0) return Math.random();
        const [min, max] = numbers();
        return min! + Math.random() * (max! - min!);
      }
      case "RANDOM_INT": {
        arity(2);
        const [min, max] = numbers();
        return Math.floor(min! + Math.random() * (max! - min!));
      }
      case "CHANCE":
        arity(1);
        return Math.random() < numeric(parameters[0], identifier.offset) ? 1 : 0;
      case "RANDOM_TRIANGLE": {
        arity(2, 3);
        const [min, max, configuredMode] = numbers();
        const mode = configuredMode ?? (min! + max!) / 2;
        const point = (mode - min!) / (max! - min!);
        const random = Math.random();
        return random < point
          ? min! + Math.sqrt(random * (max! - min!) * (mode - min!))
          : max! - Math.sqrt((1 - random) * (max! - min!) * (max! - mode));
      }
      case "RANDOM_GAUSSIAN":
      case "RANDOM_NORMAL": {
        arity(2, 4, 5);
        const values = numbers();
        const mean = values.length === 2 ? values[0]! : values[2]!;
        const deviation = values.length === 2 ? values[1]! : values[3]!;
        const sample = (): number => {
          const first = Math.max(Number.MIN_VALUE, Math.random());
          return mean + deviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * Math.random());
        };
        if (values.length === 2) return sample();
        const attempts = Math.trunc(values[4] ?? 64);
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const result = sample();
          if (result >= values[0]! && result <= values[1]!) return result;
        }
        return Math.min(Math.max(mean, values[0]!), values[1]!);
      }
      case "SWITCH": {
        if (parameters.length < 4 || parameters.length % 2 !== 0)
          arity(4);
        const selector = parameters[0];
        for (let index = 1; index < parameters.length - 1; index += 2)
          if (selector === parameters[index])
            return numeric(parameters[index + 1], identifier.offset);
        return numeric(parameters.at(-1), identifier.offset);
      }
      case "STR_LENGTH":
        arity(1);
        return stringValue(0)?.length ?? 0;
      case "STR_CONTAINS":
      case "STR_STARTS_WITH":
      case "STR_ENDS_WITH": {
        arity(2);
        const source = stringValue(0);
        const search = stringValue(1);
        if (source === null || search === null) return 0;
        if (name === "STR_CONTAINS")
          return source.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
        if (name === "STR_STARTS_WITH") return source.startsWith(search) ? 1 : 0;
        return source.endsWith(search) ? 1 : 0;
      }
      case "STR_LOWER":
      case "STR_UPPER":
      case "STR_TRIM": {
        arity(1);
        const value = stringValue(0);
        if (value === null) return null;
        if (name === "STR_LOWER") return value.toLowerCase();
        if (name === "STR_UPPER") return value.toUpperCase();
        return value.trim();
      }
      case "STR_CONCAT": {
        if (parameters.length === 0) arity(1);
        const values = parameters.map((_, index) => stringValue(index));
        return values.includes(null) ? null : values.join("");
      }
      case "TO_STRING":
        arity(1);
        return String(numeric(parameters[0], identifier.offset));
      case "FORMAT_NUMBER": {
        arity(2);
        const scale = integer(numeric(parameters[1], identifier.offset));
        if (scale > 308)
          throw new ExpressionError("FORMAT_NUMBER 的小数位数不能超过 308", identifier.offset);
        return numeric(parameters[0], identifier.offset).toFixed(scale);
      }
      case "PARSE_NUMBER": {
        arity(1, 2);
        const source = stringValue(0);
        const value = source === null ? Number.NaN : Number(source);
        if (!Number.isNaN(value)) return value;
        if (parameters.length === 2) return numeric(parameters[1], identifier.offset);
        throw new ExpressionError("PARSE_NUMBER 无法解析数值", identifier.offset);
      }
      case "IS_NUMBER":
        arity(1);
        return stringValue(0) === null || Number.isNaN(Number(stringValue(0)))
          ? 0
          : 1;
      case "STR_LEFT":
      case "STR_RIGHT":
      case "STR_SUBSTRING": {
        arity(2, ...(name === "STR_SUBSTRING" ? [3] : []));
        const value = stringValue(0);
        if (value === null) return null;
        const start = integer(numeric(parameters[1], identifier.offset));
        if (name === "STR_LEFT") return value.slice(0, start);
        if (name === "STR_RIGHT") return value.slice(value.length - start);
        const end = parameters.length === 3
          ? integer(numeric(parameters[2], identifier.offset))
          : undefined;
        return value.slice(start, end);
      }
      default:
        throw new ExpressionError(
          Messages.src.config.expression.evaluator.text0010(identifier.text),
          identifier.offset,
        );
    }
  }

  private binary(operator: Token, left: unknown, right: unknown): unknown {
    switch (operator.text) {
      case "||":
      case "|":
        return expressionTruthy(left) || expressionTruthy(right) ? 1 : 0;
      case "&&":
      case "&":
        return expressionTruthy(left) && expressionTruthy(right) ? 1 : 0;
      case "=":
      case "==":
        return left === right ? 1 : 0;
      case "!=":
      case "<>":
        return left === right ? 0 : 1;
      case ">":
        return numeric(left, operator.offset) > numeric(right, operator.offset) ? 1 : 0;
      case ">=":
        return numeric(left, operator.offset) >= numeric(right, operator.offset) ? 1 : 0;
      case "<":
        return numeric(left, operator.offset) < numeric(right, operator.offset) ? 1 : 0;
      case "<=":
        return numeric(left, operator.offset) <= numeric(right, operator.offset) ? 1 : 0;
      case "+":
        return numeric(left, operator.offset) + numeric(right, operator.offset);
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

export function isExpressionSyntax(
  source: string,
  variables?: Readonly<Record<string, unknown>>,
): boolean {
  // ContextExpression 会先把 Sparrow Message 标签替换为临时参数再编译。
  const syntaxVariables: Record<string, unknown> = { ...(variables ?? {}) };
  let tagIndex = 0;
  const substituted = source.replace(/<[\p{L}_][^<>]*>/gu, () => {
    const name = `__context_tag_${tagIndex}`;
    tagIndex += 1;
    syntaxVariables[name] = 0;
    return name;
  });
  try {
    new Parser(
      new Lexer(substituted),
      syntaxVariables,
      variables === undefined,
    ).parse();
    return true;
  } catch {
    return false;
  }
}
