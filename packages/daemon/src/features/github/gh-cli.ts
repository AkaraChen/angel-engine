// Temporary legacy surface. The implementation is private to the GitHub
// provider and this forwarding module is removed with the legacy API in P9.
export {
  createGhRunner,
  extractProcessOutput,
  findGhPath,
  type GhExecutor,
  type GhRunner,
  isNoPullRequestMessage,
  mapGhFailure,
  normalizeText,
  runGhCli,
  runGhCliCapturingExit,
} from "../source-control/providers/github/internal/gh-cli";
