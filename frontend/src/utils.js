export const getShareLink = (path) => {
  const botUsername = import.meta.env.VITE_BOT_USERNAME;
  if (botUsername) {
    const startParam = path.startsWith("/") ? path.slice(1) : path;
    const b64 = btoa(startParam).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `https://t.me/${botUsername}?startapp=${b64}`;
  }
  return `${window.location.origin}${path}`;
};
