const ADDRESS_IN_USE_PATTERN =
  /listen EADDRINUSE: address already in use ([^\s]+)/;

export function daemonStartupError(stderr: string, exitCode: number): string {
  const address = ADDRESS_IN_USE_PATTERN.exec(stderr)?.[1];
  if (address !== undefined) {
    return `Backend could not start because ${address} is already in use. Close the other Angel Engine instance or choose an automatic mobile hosting port.`;
  }

  return `Backend exited before handshake with code ${exitCode}.`;
}
