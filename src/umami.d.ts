/** Umami analytics global (loaded conditionally via script tag) */
declare const umami: { track: (event: string) => void } | undefined;
