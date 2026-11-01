import { createServerFn } from "@tanstack/react-start";
import { feedbackSchema } from "../schemas/feedback";
import { Changelog, type FeedbackRejected } from "../server/changelog";
import { runHttp } from "../server/run";

const feedbackStatus = (error: FeedbackRejected): number => {
  switch (error._tag) {
    case "FeedbackRejected":
      return 400;
    default: {
      const unexpected: never = error._tag;
      return unexpected;
    }
  }
};

export const submitFeedbackFn = createServerFn({ method: "POST" })
  .validator(feedbackSchema)
  .handler(({ data }) =>
    runHttp(
      Changelog.use((api) => api.submit(data)),
      feedbackStatus,
    ),
  );
