import { localRegistryDiscriminator } from "../registry/discriminators.js";
import { isRecord } from "../../util/records.js";

function randomNormal(random: () => number): number {
  // 把均匀随机数转成正态随机数, 最小值可避免对零取对数
  return (
    Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) *
    Math.cos(2 * Math.PI * random())
  );
}

function gamma(shape: number, random: () => number): number {
  // shape 小于 1 时先提升再缩放, 避免公式失效
  if (shape <= 0) return 0;
  if (shape < 1) return gamma(shape + 1, random) * random() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const x = randomNormal(random);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = random();
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))
    )
      return d * v;
  }
  return shape;
}

export function sampleSoundNumber(
  value: unknown,
  fallback = 1,
  random: () => number = Math.random,
): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const direct = Number(value.trim());
    if (Number.isFinite(direct)) return direct;
    const range = /^([^~]+)~([^~]+)$/u.exec(value.trim());
    if (range) {
      const first = Number(range[1]);
      const second = Number(range[2]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        const minimum = Math.min(first, second);
        return minimum + random() * (Math.max(first, second) - minimum);
      }
    }
    return fallback;
  }
  if (!isRecord(value)) return fallback;
  const provider = value;
  const type =
    typeof provider.type === "string"
      ? localRegistryDiscriminator(provider.type)
      : undefined;
  switch (type) {
    case "fixed":
    case "constant":
      return sampleSoundNumber(provider.value, fallback, random);
    case "uniform": {
      const first = sampleSoundNumber(provider.min, fallback, random);
      const second = sampleSoundNumber(provider.max, fallback, random);
      return Math.min(first, second) + random() * Math.abs(second - first);
    }
    case "expression":
      return sampleSoundNumber(
        provider.expression ?? provider.value,
        fallback,
        random,
      );
    case "normal":
    case "gaussian": {
      const mean = sampleSoundNumber(provider.mean, 0, random);
      const deviation = Math.abs(
        sampleSoundNumber(provider.std_dev ?? provider["std-dev"], 1, random),
      );
      return mean + randomNormal(random) * deviation;
    }
    case "log_normal": {
      const mean = sampleSoundNumber(provider.mean, 0, random);
      const deviation = Math.abs(
        sampleSoundNumber(provider.std_dev ?? provider["std-dev"], 1, random),
      );
      return Math.exp(mean + randomNormal(random) * deviation);
    }
    case "skew_normal": {
      const mean = sampleSoundNumber(provider.mean, 0, random);
      const deviation = Math.abs(
        sampleSoundNumber(provider.std_dev ?? provider["std-dev"], 1, random),
      );
      const skew = sampleSoundNumber(provider.skewness, 0, random);
      const delta = skew / Math.sqrt(1 + skew * skew);
      return (
        mean +
        deviation *
          (delta * Math.abs(randomNormal(random)) +
            Math.sqrt(1 - delta * delta) * randomNormal(random))
      );
    }
    case "binomial": {
      const trials = Math.max(
        0,
        Math.round(sampleSoundNumber(provider.extra, 0, random)),
      );
      const probability = sampleSoundNumber(provider.probability, 0, random);
      let successes = 0;
      for (let index = 0; index < trials; index += 1)
        if (random() < probability) successes += 1;
      return successes;
    }
    case "weighted": {
      if (!isRecord(provider.weights)) return fallback;
      const entries = Object.entries(provider.weights)
        .map(([result, weight]) => ({
          result: Number(result),
          weight: Number(weight),
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.result) &&
            Number.isFinite(entry.weight) &&
            entry.weight > 0,
        );
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let selected = random() * total;
      for (const entry of entries) {
        selected -= entry.weight;
        if (selected <= 0) return entry.result;
      }
      return fallback;
    }
    case "triangle": {
      const minimum = sampleSoundNumber(provider.min, 0, random);
      const maximum = sampleSoundNumber(provider.max, 1, random);
      const mode = sampleSoundNumber(
        provider.mode,
        (minimum + maximum) / 2,
        random,
      );
      const unit = random();
      const pivot = (mode - minimum) / (maximum - minimum || 1);
      return unit < pivot
        ? minimum + Math.sqrt(unit * (maximum - minimum) * (mode - minimum))
        : maximum -
            Math.sqrt((1 - unit) * (maximum - minimum) * (maximum - mode));
    }
    case "exponential": {
      const lambda = sampleSoundNumber(provider.lambda, 1, random);
      return lambda > 0
        ? -Math.log(Math.max(Number.MIN_VALUE, 1 - random())) / lambda
        : fallback;
    }
    case "beta": {
      const alpha = sampleSoundNumber(provider.alpha, 1, random);
      const beta = sampleSoundNumber(provider.beta, 1, random);
      const left = gamma(alpha, random);
      const right = gamma(beta, random);
      return left + right > 0 ? left / (left + right) : fallback;
    }
    default:
      return fallback;
  }
}
