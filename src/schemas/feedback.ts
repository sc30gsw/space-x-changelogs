import * as v from "valibot";

export const feedbackSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty("Please enter your name.")),
  email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email address.")),
  message: v.pipe(v.string(), v.trim(), v.minLength(10, "Message must be at least 10 characters.")),
});

export type FeedbackInput = v.InferOutput<typeof feedbackSchema>;
