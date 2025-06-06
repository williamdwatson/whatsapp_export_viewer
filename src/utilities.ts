/**
 * Gets the basename from a file `path`. From https://stackoverflow.com/a/15270931
 * @param path File path
 * @returns Basename of filepath, including extension
 */
export function getBasename(path: string) {
    return path.split(/[\\/]/).pop();
}
