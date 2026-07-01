export type Scale = "binary" | "triple";
export type AnswerValue = 0 | 1 | 2 | 3;

export function allowedValues(scale: Scale): AnswerValue[] {
  return scale === "binary" ? [0, 1] : [1, 2, 3];
}

export function isValidAnswer(scale: Scale, value: number): value is AnswerValue {
  return (allowedValues(scale) as number[]).includes(value);
}
