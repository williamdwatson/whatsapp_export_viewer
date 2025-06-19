import { media_t } from "./types";

export abstract class Message {
    timestamp: Date;
    sender: string | null;
    idx: number;
    backend_idx: number;
    starred: boolean;
    abstract content: any;

    constructor(timestamp: string, sender: string | null, idx: number, backend_idx: number, starred: boolean = false) {
        this.timestamp = new Date(timestamp);
        this.sender = sender;
        this.idx = idx;
        this.backend_idx = backend_idx;
        this.starred = starred;
    }
}

export class TextMessage extends Message {
    content: string;

    constructor(timestamp: string, sender: string | null, content: string, idx: number, backend_idx: number, starred: boolean = false) {
        super(timestamp, sender, idx, backend_idx, starred);
        this.content = content;
    }
}

export class SystemMessage extends Message {
    content: string;

    constructor(timestamp: string, sender: string | null, content: string, idx: number, backend_idx: number, starred: boolean = false) {
        super(timestamp, sender, idx, backend_idx, starred);
        this.content = content;
    }
}

export class MediaMessage extends Message {
    content: {
        media_type: media_t["media_type"],
        path: string | null,
        caption: string | null
    };

    constructor(timestamp: string, sender: string | null, media_type: media_t["media_type"], path: string | null, caption: string | null, idx: number, backend_idx: number, starred: boolean = false) {
        super(timestamp, sender, idx, backend_idx, starred);
        this.content = {
            media_type,
            path,
            caption
        };
    }
}

export class BulkMediaMessage extends Message {
    content: {
        media_type: media_t["media_type"],
        path: string,
        backend_idx: number,
        timestamp: Date
    }[];

    constructor(timestamp: string, sender: string | null, media_types: media_t["media_type"][], paths: string[], backend_idxes: number[], timestamps: string[], idx: number, backend_idx: number, starred: boolean = false) {
        super(timestamp, sender, idx, backend_idx, starred);
        const c: typeof this.content = [];
        for (let i = 0; i < media_types.length; i++) {
            c.push({
                media_type: media_types[i],
                path: paths[i],
                backend_idx: backend_idxes[i],
                timestamp: new Date(timestamps[i])
            })
        }
        this.content = c;
    }
}