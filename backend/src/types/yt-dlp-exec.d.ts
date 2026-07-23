declare module 'yt-dlp-exec' {
    interface YtDlpSubtitleTrack {
        ext: string;
        url: string;
        name?: string;
    }

    interface YtDlpInfo {
        title: string;
        channel: string | null;
        duration: number;
        availability: string;
        has_audio: boolean;
        subtitles?: Record<string, YtDlpSubtitleTrack[]>;
        automatic_captions?: Record<string, YtDlpSubtitleTrack[]>;
    }

    interface YtDlpOptions {
        dumpSingleJson?: boolean;
        noWarnings?: boolean;
        noCheckCertificates?: boolean;
        skipDownload?: boolean;
    }

    function ytDlp(url: string, options?: YtDlpOptions): Promise<YtDlpInfo>;
    export = ytDlp;
}