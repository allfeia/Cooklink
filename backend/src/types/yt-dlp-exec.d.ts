declare module 'yt-dlp-exec' {
    interface YtDlpInfo {
        title: string;
        channel: string | null;
        duration: number;
        availability: string;
        has_audio: boolean;
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