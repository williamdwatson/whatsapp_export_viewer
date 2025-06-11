import { message_content_t } from "./types";

/**
 * Gets the basename from a file `path`. From https://stackoverflow.com/a/15270931
 * @param path File path
 * @returns Basename of filepath, including extension
 */
export function getBasename(path: string) {
    return path.split(/[\\/]/).pop();
}

/**
 * Gets the type of the given message
 * @param msg Message content for which to get the type
 * @returns `null` if `msg` is nullish, "text" for text messages, "media" for media messages, and "system" otherwise
 */
export function getMessageType(msg: message_content_t | null | undefined) {
    if (msg == null) {
        return null;
    }
    else if (msg.hasOwnProperty("Text")) {
        return "text";
    }
    else if (msg.hasOwnProperty("Media")) {
        return "media";
    }
    return "system";
}

/**
 * Simple, **insecure** numeric hash derived from https://gist.github.com/jlevy/c246006675becc446360a798e2b2d781
 * @param str String to hash
 * @returns Numeric hash of `str`
 */
export function simpleHash(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
    }
    return hash;
}
