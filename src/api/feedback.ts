import { Effect, Predicate } from "effect";
import { submitFeedbackFn } from "../functions/feedback";
import type { FeedbackInput } from "../schemas/feedback";
import type { FeedbackReceipt } from "../server/changelog";

const toFormError = (cause: unknown): Error =>
  Predicate.isError(cause) ? cause : new Error("Could not send feedback.");

export const submitFeedback = (input: FeedbackInput): Promise<FeedbackReceipt> =>
  Effect.runPromise(
    Effect.tryPromise({
      try: () => submitFeedbackFn({ data: input }),
      catch: (cause) => cause,
    }).pipe(Effect.mapError(toFormError)),
  );
