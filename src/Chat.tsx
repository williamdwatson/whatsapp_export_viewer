import { Avatar } from "primereact/avatar";
import { getBasename } from "./utilities";
import { Card } from "primereact/card";
import { CSSProperties, ReactNode, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Image } from "primereact/image";
import { Button } from "primereact/button";
import { openPath } from "@tauri-apps/plugin-opener";
import AutoLink from "./AutoLink";
import HighlightText from "./HighlightText";
import { BulkMediaMessage, MediaMessage, Message, SystemMessage, TextMessage } from "./messages";
import { Dialog } from "primereact/dialog";
import { Divider } from "primereact/divider";

/**
 * Gets the formatted title for the `message`
 * @param message Message for which to get the title
 * @param starMessage Callback to (un)star the `message`
 * @returns The title element for the `message`
 */
function getTitle(message: Message, starMessage?: (message: Message) => void) {
    return <>
        {message.sender}
        <span style={{ fontWeight: "normal", fontSize: "smaller", float: "right", marginTop: "3px", marginLeft: "5px" }}>
            {message.timestamp.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
            {starMessage == undefined ? null : <i className={`pi pi-star${message.starred ? "-fill" : ""}`} style={{ marginLeft: "5px", cursor: "pointer" }} onClick={() => starMessage(message)} />}
        </span>

    </>
}

interface SystemChatProps {
    /**
     * System message to display
     */
    message: SystemMessage,
    /**
     * Text to highlight, if any
     */
    highlightText?: string,
    /**
     * Width of the system chat message
     */
    width: CSSProperties["width"],
    /**
     * Whether the message is from you
     * @default false
     */
    fromYou?: boolean
}
/**
 * Displays a system message (such as adding a participant, renaming the chat, etc.)
 */
function SystemChat(props: SystemChatProps) {
    return <div>
        <Card style={{ width: props.width, display: "inline-block", textAlign: "center" }}>
            <i className="zero-margin">
                {props.highlightText == null ?
                    props.message.content
                    : <HighlightText highlight={props.highlightText}>{props.message.content}</HighlightText>
                }
            </i>
        </Card>
    </div>
}

interface TextChatProps {
    /**
     * Text message to display
     */
    message: TextMessage,
    /**
     * Callback to (un)star the `message`
     * @param message Message to (un)star
     */
    starMessage?: (message: TextMessage) => void,
    /**
     * Text to highlight, if any
     */
    highlightText?: string,
    /**
     * Whether to show the sender avatar
     */
    showAvatar: boolean,
    /**
     * Whether the message is from you (puts the avatar on the right side and changes the background color)
     * @default false
     */
    fromYou?: boolean
}
/**
 * Displays a standard text message
 */
function TextChat(props: TextChatProps) {
    return <div style={{ float: props.fromYou ? "right" : undefined }}>
        {props.showAvatar && !props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="right-pad" /> : null}
        <Card style={{ width: undefined, maxWidth: "45vw", display: "inline-block", backgroundColor: props.fromYou ? "var(--highlight-bg)" : undefined }} title={getTitle(props.message, props.starMessage)}>
            <p className="zero-margin">
                {props.highlightText == null ?
                    <AutoLink text={props.message.content} />
                    : <HighlightText highlight={props.highlightText}>{props.message.content}</HighlightText>
                }
            </p>
        </Card>
        {props.showAvatar && props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="you-avatar" /> : null}
    </div>
}

interface MediaChatProps {
    /**
     * Media message to display
     */
    message: MediaMessage,
    /**
     * Callback when the media loads
     */
    onContentChange?: () => void,
    /**
     * Callback to (un)star the `message`
     * @param message Message to (un)star
     */
    starMessage?: (message: MediaMessage) => void,
    /**
     * Text to highlight, if any
     */
    highlightText?: string,
    /**
     * Whether to show the sender avatar
     */
    showAvatar: boolean,
    /**
     * Whether to show the larger image popup
     */
    showPreview: boolean;
    /**
     * Whether the message is from you (puts the avatar on the right side and changes the background color)
     * @default false
     */
    fromYou?: boolean
}
/**
 * Displays a media (photo, video, audio, or file) message
 */
function MediaChat(props: MediaChatProps) {
    const [loadingFile, setLoadingFile] = useState(false);
    let element: ReactNode;
    if (props.message.content.media_type === "PHOTO") {
        element = props.message.content.path == null ? <i>Photo unavailable</i>
            : <Image onLoad={props.onContentChange} imageStyle={{ maxHeight: "20vh", maxWidth: "45vh" }} src={convertFileSrc(props.message.content.path)} preview={props.showPreview} />
    }
    else if (props.message.content.media_type === "VIDEO") {
        element = props.message.content.path == null ? <i>Video unavailable</i> : <video style={{ maxHeight: "20vh", maxWidth: "45vh" }} controls={props.showPreview} src={convertFileSrc(props.message.content.path)} onLoad={props.onContentChange} />
    }
    else if (props.message.content.media_type === "AUDIO") {
        element = props.message.content.path == null ? <i>Audio unavailable</i> : <audio controls src={convertFileSrc(props.message.content.path)} />
    }
    else {
        const p = props.message.content.path;
        if (p != null) {
            const icon = p.toLowerCase().endsWith("pdf") ? "pi-file-pdf"
                : p.toLowerCase().endsWith("doc") || p.toLowerCase().endsWith("docx") ? "pi-file-word"
                    : p.toLowerCase().endsWith("xls") || p.toLowerCase().endsWith("xlsx") ? "pi-file-excel" : "pi-file";
            element = <Button label={getBasename(p)} icon={`pi ${icon}`} style={{ marginTop: "5px", maxWidth: "45vw" }} onClick={() => { setLoadingFile(true); openPath(p).finally(() => setLoadingFile(false)) }} loading={loadingFile} />
        }
        else {
            element = <i>File unavailable</i>
        }
    }
    return <div style={{ float: props.fromYou ? "right" : undefined }}>
        {props.showAvatar && !props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="right-pad" /> : null}
        <Card style={{ width: undefined, maxWidth: "45vw", display: "inline-block", backgroundColor: props.fromYou ? "var(--highlight-bg)" : undefined }} title={getTitle(props.message, props.starMessage)}>
            {element}
            {props.message.content.caption == null ? null :
                <p className="zero-margin">
                    {props.highlightText == null ?
                        <AutoLink text={props.message.content.caption} />
                        : <HighlightText highlight={props.highlightText}>{props.message.content.caption}</HighlightText>
                    }
                </p>
            }
        </Card>
        {props.showAvatar && props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="you-avatar" /> : null}
    </div>
}

interface ThumbnailProps {
    /**
     * Thumbnail content
     */
    content: BulkMediaMessage["content"][number],
    /**
     * Callback when the media loads
     */
    onContentChange?: () => void,
    /**
     * Additional styling for the thumbnail
     */
    style?: CSSProperties
}

/**
 * An image/video thumbnail
 */
function Thumbnail(props: ThumbnailProps) {
    if (props.content.media_type === "PHOTO") {
        return <img src={convertFileSrc(props.content.path)} onLoad={props.onContentChange} style={{ maxWidth: "22vw", maxHeight: "10vh", ...props.style }} />
    }
    else {
        return <video src={convertFileSrc(props.content.path)} onLoad={props.onContentChange} style={{ maxWidth: "22vw", maxHeight: "10vh", ...props.style }} />
    }
}

interface BulkMediaChatProps {
    /**
     * Media messages to display
     */
    message: BulkMediaMessage,
    /**
     * Callback when the media loads
     */
    onContentChange?: () => void,
    /**
     * Callback to (un)star the `message`
     * @param message Message to (un)star
     */
    starMessage?: (message: MediaMessage) => void,
    /**
     * Whether to show the sender avatar
     */
    showAvatar: boolean,
    /**
     * Whether the message is from you (puts the avatar on the right side and changes the background color)
     * @default false
     */
    fromYou?: boolean
}

/**
 * Displays multiple media messages
 */
function BulkMediaChat(props: BulkMediaChatProps) {
    const [showMedia, setShowMedia] = useState(false);

    return <>
        <Dialog header={props.message.sender} visible={showMedia} onHide={() => setShowMedia(false)} maximized>
            {props.message.content.map(c => {
                return <div className="text-center" key={`popup-media-${c.path}`}>
                    <b style={{ display: "block", marginBottom: "5px" }}>{c.timestamp.toLocaleString()}</b>
                    {c.path == null || c.path === "" ? <i>File unavailable</i> : c.media_type === "PHOTO" ?
                        <Image imageStyle={{ maxHeight: "40vh", maxWidth: "85vh" }} src={convertFileSrc(c.path)} preview />
                        : c.media_type === "VIDEO" ?
                            <video controls style={{ maxHeight: "40vh", maxWidth: "85vh" }} src={convertFileSrc(c.path)} />
                            : null}
                    <Divider />
                </div>
            })}
        </Dialog>
        <div style={{ float: props.fromYou ? "right" : undefined }}>
            {props.showAvatar && !props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="right-pad" /> : null}
            <Card style={{ width: undefined, display: "inline-block", backgroundColor: props.fromYou ? "var(--highlight-bg)" : undefined }} title={getTitle(props.message, props.starMessage)}>
                <div className="bulk-region" onClick={() => setShowMedia(true)}>
                    <div style={{ display: "inline-block" }}>
                        <Thumbnail content={props.message.content[0]} style={{ marginRight: "5px" }} onContentChange={props.onContentChange} />
                        <Thumbnail content={props.message.content[1]} onContentChange={props.onContentChange} />
                        <br />
                        <Thumbnail content={props.message.content[2]} style={{ marginRight: "5px" }} onContentChange={props.onContentChange} />
                        <Thumbnail content={props.message.content[3]} onContentChange={props.onContentChange} />
                    </div>
                    {props.message.content.length > 4 ?
                        <div style={{ display: "inline-block", marginLeft: "10px" }}>
                            <b>+ {props.message.content.length - 4}</b>
                        </div>
                        : null}
                    <div className="overlay">
                    </div>
                </div>
            </Card>
            {props.showAvatar && props.fromYou ? <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" className="you-avatar" /> : null}
        </div>
    </>
}

interface ChatProps {
    /**
     * Message to display
     */
    message: Message,
    /**
     * Callback when the content of a media message loads
     */
    onContentChange?: () => void,
    /**
     * Callback to (un)star a message
     * @param message Message to (un)star
     */
    starMessage?: (message: Message) => void,
    /**
     * Text to highlight, if any
     */
    highlightText?: string,
    /**
     * Whether to show the sender avatar
     * @default true
     */
    showAvatar?: boolean,
    /**
     * Whether to allow the larger version popup for an image
     * @default true
     */
    showPreview?: boolean;
    /**
     * Width of a system message
     */
    systemMessageWidth: CSSProperties["width"],
    /**
     * Whether the message is from you (puts the avatar on the right side and changes the background color)
     * @default false
     */
    fromYou?: boolean
}
export default function Chat(props: ChatProps) {
    const showAvatar = props.showAvatar ?? true;
    if (props.message instanceof TextMessage) {
        return <TextChat message={props.message as TextMessage} starMessage={props.starMessage} showAvatar={showAvatar} fromYou={props.fromYou} highlightText={props.highlightText} />
    }
    else if (props.message instanceof MediaMessage) {
        return <MediaChat onContentChange={props.onContentChange} message={props.message as MediaMessage} starMessage={props.starMessage} showAvatar={showAvatar} showPreview={props.showPreview ?? true} fromYou={props.fromYou} highlightText={props.highlightText} />
    }
    else if (props.message instanceof BulkMediaMessage) {
        return <BulkMediaChat onContentChange={props.onContentChange} message={props.message as BulkMediaMessage} starMessage={props.starMessage} showAvatar={showAvatar} fromYou={props.fromYou} />
    }
    else {
        return <SystemChat message={props.message as SystemMessage} fromYou={props.fromYou} highlightText={props.highlightText} width={props.systemMessageWidth} />
    }
}