interface HighlightTextProps {
    /**
     * Text to highlight
     */
    highlight: string,
    /**
     * Child text
     */
    children: string,
    /**
     * Whether to use case-insensitive matching
     * @default true
     */
    caseInsensitive?: boolean
}

export default function HighlightText(props: HighlightTextProps) {
    /**
     * Finds the indices of non-overlapping instances of `sub` in str`
     * @param str String to search within
     * @param sub Substring to search for in `str`
     * @returns Start indices of non-overlapping locations of `sub` in `str
     */
    const getNonOverlappingIndices = (str: string, sub: string) => {
        const strToSearch = (props.caseInsensitive ?? true) ? str.toLowerCase() : str;
        const toSearchFor = (props.caseInsensitive ?? true) ? sub.toLowerCase() : sub;
        const indices = [];
        let startIndex = strToSearch.indexOf(toSearchFor, 0);
        while (startIndex !== -1) {
            indices.push(startIndex);
            startIndex = strToSearch.indexOf(toSearchFor, startIndex + toSearchFor.length);
        }
        return indices;
    }

    let lastIdx = 0;
    const pieces = [];
    for (const i of getNonOverlappingIndices(props.children, props.highlight)) {
        pieces.push(props.children.substring(lastIdx, i));
        pieces.push(<span className="highlighted-text">{props.children.substring(i, i + props.highlight.length)}</span>)
        lastIdx = i + props.highlight.length;
    }
    if (lastIdx !== props.children.length - 1) {
        pieces.push(props.children.substring(lastIdx));
    }

    return <>
        {...pieces}
    </>
}