// Europa (inclusiv țări asociate/candidate). Notificările „cineva a intrat pe
// site" și „link inexistent (404)" se trimit doar pentru vizitatori din aceste
// țări — traficul din US / Canada / Mexic / restul lumii e aproape întotdeauna
// boți sau irelevant pentru o afacere locală din România.
export const ALLOWED_NOTIFY_COUNTRIES = new Set([
  "RO", "AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK",
  "EE", "ES", "FI", "FR", "GB", "GE", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU",
  "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RS", "RU", "SE", "SI", "SK",
  "SM", "TR", "UA", "VA", "XK", "GI", "IM", "JE", "GG",
]);

/**
 * True when the owner should be notified about a visitor from this country.
 * An unknown / empty country returns `true` — we don't silently drop visitors
 * whose IP simply couldn't be geo-resolved.
 */
export function isNotifiableCountry(country?: string | null): boolean {
  if (!country) return true;
  return ALLOWED_NOTIFY_COUNTRIES.has(country.toUpperCase());
}
