exports.default = async function notarizeDmgArtifact(event) {
  if (!event.file || !event.file.endsWith(".dmg")) {
    return;
  }

  if (typeof event.packager.notarizeIfProvided === "function") {
    await event.packager.notarizeIfProvided(event.file);
    return;
  }

  const { notarize } = require("@electron/notarize");
  const process = require("node:process");

  await notarize({
    appPath: event.file,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
    appleApiKey: process.env.APPLE_API_KEY,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    tool: "notarytool",
  });
};
