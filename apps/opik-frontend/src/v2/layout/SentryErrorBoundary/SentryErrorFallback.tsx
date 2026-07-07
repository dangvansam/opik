import React from "react";
import { FallbackRender } from "@sentry/react";

import somethingWentWrongImage from "/images/something-went-wrong.png";
import { Button } from "@/ui/button";

const SentryErrorFallback: FallbackRender = ({ resetError }) => {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-5 bg-[url('/images/circle-pattern.png')] bg-cover bg-center">
      <img
        src={somethingWentWrongImage}
        alt="Something went wrong"
        width="274px"
      />

      <h2 className="comet-title-l">Something went wrong</h2>

      <div className="comet-body-s flex max-w-xl flex-col gap-4 text-center text-muted-slate">
        <p>
          We are sorry for the inconvenience. This error has been reported. If
          you have any urgent issues, please{" "}
          <Button variant="link" size="sm" asChild className="inline px-0">
            <a href="mailto:support@comet.com">contact us</a>
          </Button>{" "}
          directly.
        </p>
      </div>

      <Button onClick={resetError}>Continue</Button>
    </div>
  );
};

export default SentryErrorFallback;
