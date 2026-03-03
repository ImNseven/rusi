import crypto from "crypto";

function toDataCheckString(initData) {
  const parsed = new URLSearchParams(initData);
  const pairs = [];
  for (const [key, value] of parsed.entries()) {
    if (key !== "hash") {
      pairs.push(`${key}=${value}`);
    }
  }
  return pairs.sort().join("\n");
}

export function validateTelegramInitData(initData, botToken) {
  const parsed = new URLSearchParams(initData);
  const hash = parsed.get("hash");
  if (!hash) return false;

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = toDataCheckString(initData);
  const computedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return computedHash === hash;
}

export function parseTelegramUser(initData) {
  const parsed = new URLSearchParams(initData);
  const userRaw = parsed.get("user");
  if (!userRaw) return null;
  return JSON.parse(userRaw);
}

