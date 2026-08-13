import { Messages } from "../../messages.js";

export interface JukeboxSongSchemaField {
  readonly label: string;
  readonly aliases?: readonly string[];
  readonly detail: string;
  readonly kind: "sound" | "text" | "number" | "integer";
}

export const JUKEBOX_SONG_FIELDS: readonly JukeboxSongSchemaField[] = [
  {
    label: "sound",
    detail: Messages.src.config.jukebox.schema.text0001,
    kind: "sound",
  },
  {
    label: "description",
    detail: Messages.src.config.jukebox.schema.text0002,
    kind: "text",
  },
  {
    label: "length",
    detail: Messages.src.config.jukebox.schema.text0003,
    kind: "number",
  },
  {
    label: "range",
    detail: Messages.src.config.jukebox.schema.text0004,
    kind: "number",
  },
  {
    label: "comparator-output",
    aliases: ["comparator_output"],
    detail: Messages.src.config.jukebox.schema.text0005,
    kind: "integer",
  },
];
