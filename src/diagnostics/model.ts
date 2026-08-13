export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export type IssueSeverity = "error" | "warning" | "information";

export interface RelatedIssue {
  readonly message: string;
  readonly uri: string;
  readonly range: TextRange;
}

export interface CoreIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: IssueSeverity;
  readonly uri: string;
  readonly range: TextRange;
  readonly related?: readonly RelatedIssue[];
}
