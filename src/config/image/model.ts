import type { ConfigurationSource } from "../model.js";

export type ImageSource = ConfigurationSource;

export interface TextureCandidate {
  readonly path: string;
  readonly resourcePackRoot: string;
  readonly effective: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface BitmapImageSpec {
  readonly kind: "bitmap";
  readonly file: string;
  readonly font: string;
  readonly height?: number;
  readonly ascent?: number;
  readonly rows: number;
  readonly columns: number;
  readonly codepoints: readonly (readonly (number | undefined)[])[];
  readonly textureCandidates: readonly TextureCandidate[];
}

export interface ReferenceImageSpec {
  readonly kind: "reference";
  readonly ref: string;
  readonly shortReference: boolean;
  readonly row: number;
  readonly column: number;
}

export interface ImageDefinition {
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ImageSource;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly spec: BitmapImageSpec | ReferenceImageSpec;
}

export interface ResolvedImage {
  readonly bitmap: ImageDefinition;
  readonly row: number;
  readonly column: number;
  readonly chain: readonly ImageDefinition[];
}
