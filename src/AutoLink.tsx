import { simpleHash } from "./utilities";

/**
 * Auto-link component from https://www.30secondsofcode.org/react/s/auto-link/ with changes
 */
export default function AutoLink({ text }: { text: string }) {
    const url_delimiter = /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+(?:com|net|org|edu|gov|us|ca|uk|is|gl)(?::\d{1,5})?(?:\/[^\s]*)?\b/gi;
    const email_delimiter = /\S+@\S+\.\S+/gi;
    const hashed = simpleHash(text);
    // TODO Phone numbers (would require a separate pass not splitting on whitespace)
    return (
        <>
            {text.split(/( )/).map(word => {
                const url_match = word.match(url_delimiter);
                const email_match = word.match(email_delimiter);
                if (email_match) {
                    return <a href={`mailto:${word}`} key={`${hashed}-${word}`}>{word}</a>
                }
                else if (url_match) {
                    const url = url_match[0];
                    return (
                        <a href={url.startsWith("http") ? url : `http://${url}`} target="_blank" key={`${hashed}-${word}`}>{url}</a>
                    );
                }
                if (word.startsWith("*") && word.endsWith("*")) {
                    return <b key={`${hashed}-${word}`}>{word.substring(1, word.length - 1)}</b>
                }
                else if (word.startsWith("*") && word.endsWith("*.")) {
                    return <><b key={`${hashed}-${word}`}>{word.substring(1, word.length - 2)}</b>.</>
                }
                else if (word.startsWith("_") && word.endsWith("_")) {
                    return <i key={`${hashed}-${word}`}>{word.substring(1, word.length - 1)}</i>
                }
                else if (word.startsWith("_") && word.endsWith("_.")) {
                    return <><i key={`${hashed}-${word}`}>{word.substring(1, word.length - 2)}</i>.</>
                }
                else if (word.startsWith("~") && word.endsWith("~")) {
                    return <s key={`${hashed}-${word}`}>{word.substring(1, word.length - 1)}</s>
                }
                else if (word.startsWith("~") && word.endsWith("~.")) {
                    return <><s key={`${hashed}-${word}`}>{word.substring(1, word.length - 2)}</s>.</>
                }
                else if (word.startsWith("```") && word.endsWith("```")) {
                    return <code key={`${hashed}-${word}`}>{word.substring(3, word.length - 3)}</code>
                }
                else if (word.startsWith("`") && word.endsWith("`")) {
                    return <code key={`${hashed}-${word}`}>{word.substring(1, word.length - 1)}</code>
                }
                else if (word.startsWith("`") && word.endsWith("`.")) {
                    return <><code key={`${hashed}-${word}`}>{word.substring(1, word.length - 2)}</code>.</>
                }
                else if (word.includes("\n")) {
                    return <span className="message-with-line-break" key={`${hashed}-${word}`}>{word}</span>
                }
                return word;
            })}
        </>
    );
};
