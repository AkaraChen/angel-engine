let linearToken: string | undefined;

export function setLinearToken(token: string | undefined) {
  linearToken = token;
}

export function getLinearToken() {
  return linearToken;
}
