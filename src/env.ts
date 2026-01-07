import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    FRIENDLI_TOKEN: z.string().min(1),
    EXPERIMENTAL_TRIM_TRAILING_NEWLINES: z.stringbool().default(true),
    DEBUG_SHOW_FINISH_REASON: z.stringbool().default(false),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
