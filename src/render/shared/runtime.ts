import { Messages } from "../../messages.js";

export type UnknownRecord = Record<string, unknown>;

export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !isUnknownArray(value);
}

export function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

export function element<ElementType extends HTMLElement>(
  id: string,
  constructor: abstract new (...arguments_: never[]) => ElementType,
): ElementType {
  const value = document.getElementById(id);
  if (value instanceof constructor) return value;
  throw new TypeError(Messages.web.shared.runtime.text0001(id));
}

export function optionalElement<ElementType extends HTMLElement>(
  id: string,
  constructor: abstract new (...arguments_: never[]) => ElementType,
): ElementType | undefined {
  const value = document.getElementById(id);
  return value instanceof constructor ? value : undefined;
}

export function canvasContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", options);
  if (context) return context;
  throw new Error(Messages.web.shared.runtime.text0002);
}

export function queryElements<ElementType extends Element>(
  selector: string,
  constructor: abstract new (...arguments_: never[]) => ElementType,
): ElementType[] {
  return [...document.querySelectorAll(selector)].flatMap((value) =>
    value instanceof constructor ? [value] : [],
  );
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
