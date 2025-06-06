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

type image_dimensions_t = {
    /**
     * Image natural height
     */
    naturalHeight: number,
    /**
     * Image natural width
     */
    naturalWidth: number
}

/**
 * Gets the dimensions of the given image.
 * From https://stackoverflow.com/a/64268847/25985646
 * @param src Image source
 * @returns Image natural dimensions
 */
export const getImageDimesions = (src: string) => new Promise<image_dimensions_t>(resolve => {
    const img = new Image();
    img.onload = () => {
        resolve({
            naturalHeight: img.naturalHeight,
            naturalWidth: img.naturalWidth,
        });
    }
    img.src = src;
});
