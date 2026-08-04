import { existsSync, statSync } from 'fs';

export function getYtDlpCookiesOption(): { cookies: string } | Record<string, never> {
    const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    if (!cookiesPath || !existsSync(cookiesPath) || statSync(cookiesPath).size === 0) {
        return {};
    }
    return { cookies: cookiesPath };
}
