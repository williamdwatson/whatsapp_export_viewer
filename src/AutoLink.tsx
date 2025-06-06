/**
 * Auto-link component from https://www.30secondsofcode.org/react/s/auto-link/
 */
export default function AutoLink({ text }: { text: string }) {
    const url_delimiter = /((?:https?:\/\/)?(?:(?:[a-z0-9]?(?:[a-z0-9\-]{1,61}[a-z0-9])?\.[^\.|\s])+[a-z\.]*[a-z]+|(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3})(?::\d{1,5})*[a-z0-9.,_\/~#&=;%+?\-\\(\\)]*)/gi;
    const email_delimiter = /\S+@\S+\.\S+/gi;
    // TODO Phone numbers (would require a separate pass not splitting on whitespace)
    return (
        <>
            {text.split(/(\s)/).map(word => {
                const url_match = word.match(url_delimiter);
                const email_match = word.match(email_delimiter);
                if (email_match) {
                    return <a href={`mailto:${word}`}>{word}</a>
                }
                else if (url_match) {
                    const url = url_match[0];
                    return (
                        <a href={url.startsWith("http") ? url : `http://${url}`} target="_blank" key={`link-${url}`}>{url}</a>
                    );
                }
                return word;
            })}
        </>
    );
};
