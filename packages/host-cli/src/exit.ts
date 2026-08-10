/** CLI process exit codes (Stage 1 contract). */
export const ExitCode = {
  success: 0,
  usage: 1,
  auth: 2,
  unreachable: 3,
  domain: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
