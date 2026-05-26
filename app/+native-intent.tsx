export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }) {
  if (path.startsWith('tel:')) {
    const number = decodeURIComponent(path.slice(4));
    return `/phone?number=${encodeURIComponent(number)}`;
  }
  if (path.startsWith('sms:') || path.startsWith('smsto:')) {
    const number = decodeURIComponent(path.replace(/^sms(to)?:/, '').split('?')[0].split('&')[0]);
    return `/sms?number=${encodeURIComponent(number)}`;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return `/browser?url=${encodeURIComponent(path)}`;
  }
  return '/';
}
