const MOBILE_BOOTSTRAP = `<script>window.__ANGEL_DAEMON__=${JSON.stringify({
  requiresAuth: true,
})};</script>`;

export function injectMobileBootstrap(html: string): string {
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${MOBILE_BOOTSTRAP}`);
  }
  return `${MOBILE_BOOTSTRAP}${html}`;
}
