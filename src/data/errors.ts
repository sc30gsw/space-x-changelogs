import { Schema } from "effect";

export class PersistRejected extends Schema.TaggedError<PersistRejected>()("PersistRejected", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
