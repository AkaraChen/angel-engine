import { type as arkType } from "arktype";

type ArkValidator<T> = (input: unknown) => T | arkType.errors;

const stringInput = arkType("string");

export function parseInput<T>(validator: ArkValidator<T>, input: unknown): T {
  const result = validator(input);
  if (result instanceof arkType.errors) {
    throw new Error(result.summary);
  }

  return result;
}

export function parseObjectInput<T>(
  validator: ArkValidator<T>,
  input: unknown,
  message: string,
): T {
  if (!input || typeof input !== "object") {
    throw new Error(message);
  }

  return parseInput(validator, input);
}

export function parseStringInput(value: unknown, message: string): string {
  const result = stringInput(value);
  if (result instanceof arkType.errors) {
    throw new Error(message);
  }

  return result;
}
