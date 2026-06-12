export const APP_NAME = "image-quick";
export const APP_VERSION = "0.1.0";
export const USER_AGENT = `${APP_NAME}/${APP_VERSION}`;
export const DEFAULT_OPENAI_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
