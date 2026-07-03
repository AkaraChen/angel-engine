import { type } from "arktype";

export const agentSkillsInput = type({
  "+": "ignore",
  "projectPath?": "string > 0 | undefined",
  runtime: "string > 0",
});
