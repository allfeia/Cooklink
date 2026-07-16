export type Platform = 'youtube';

interface DomainRule {
    platform: Platform;
    domains: string[];
}

const DOMAIN_REGISTRY: DomainRule[] = [
    { platform: 'youtube', domains: ['youtube.com', 'youtu.be'] },
];

function matchesDomain(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function detectPlatform(rawUrl: unknown): Platform | null {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
        return null;
    }

    let hostname: string;
    try {
        hostname = new URL(rawUrl.trim()).hostname.toLowerCase();
    } catch {
        return null;
    }

    if (!hostname) return null;

    const rule = DOMAIN_REGISTRY.find((r) =>
        r.domains.some((domain) => matchesDomain(hostname, domain))
    );

    return rule ? rule.platform : null;
}