import { Avatar } from "primereact/avatar";
import { media_message_t, message_t, system_message_t, text_message_t } from "./types";
import { getBasename, getMessageType } from "./utilities";
import { Card } from "primereact/card";
import { ReactNode, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Image } from "primereact/image";
import { Button } from "primereact/button";
import { openPath } from "@tauri-apps/plugin-opener";
import AutoLink from "./AutoLink";

/**
 * Gets the formatted title for the `message`
 * @param message Message for which to get the title
 * @param starMessage Callback to (un)star the `message`
 * @returns The title element for the `message`
 */
function getTitle(message: message_t, starMessage?: (message: message_t) => void) {
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
    message: system_message_t
}
/**
 * Displays a system message (such as adding a participant, renaming the chat, etc.)
 */
function SystemChat(props: SystemChatProps) {
    return <div>
        <Card style={{ width: "80vw", display: "inline-block", textAlign: "center" }}>
            <i style={{ margin: 0 }}>{props.message.content.System}</i>
        </Card>
    </div>
}

interface TextChatProps {
    /**
     * Text message to display
     */
    message: text_message_t,
    /**
     * Callback to (un)star the `message`
     * @param message Message to (un)star
     */
    starMessage?: (message: message_t) => void,
}
/**
 * Displays a standard text message
 */
function TextChat(props: TextChatProps) {
    return <div>
        <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" style={{ marginRight: "5px" }} />
        <Card style={{ width: undefined, maxWidth: "45vw", display: "inline-block" }} title={getTitle(props.message, props.starMessage)}>
            <p style={{ margin: 0 }}><AutoLink text={props.message.content.Text} /></p>
        </Card>
    </div>
}

interface MediaChatProps {
    /**
     * Media message to display
     */
    message: media_message_t,
    /**
     * Callback when the media loads
     */
    onContentChange?: () => void,
    /**
     * Callback to (un)star the `message`
     * @param message Message to (un)star
     */
    starMessage?: (message: message_t) => void,
}
/**
 * Displays a media (photo, video, audio, or file) message
 */
function MediaChat(props: MediaChatProps) {
    const [loadingFile, setLoadingFile] = useState(false);
    let element: ReactNode;
    if (props.message.content.Media.media_type === "PHOTO") {
        element = props.message.content.Media.path == null ? <i>Photo unavailable</i>
            : <Image onLoad={props.onContentChange} imageStyle={{ maxHeight: "20vh", maxWidth: "45vh" }} src={convertFileSrc(props.message.content.Media.path)} preview />
    }
    else if (props.message.content.Media.media_type === "VIDEO") {
        element = props.message.content.Media.path == null ? <i>Video unavailable</i> : <video style={{ maxHeight: "20vh", maxWidth: "45vh" }} controls src={convertFileSrc(props.message.content.Media.path)} onLoad={props.onContentChange} />
    }
    else if (props.message.content.Media.media_type === "AUDIO") {
        element = props.message.content.Media.path == null ? <i>Audio unavailable</i> : <audio controls src={convertFileSrc(props.message.content.Media.path)} />
    }
    else {
        const p = props.message.content.Media.path;
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
    return <div>
        <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" style={{ marginRight: "5px" }} />
        <Card style={{ width: undefined, display: "inline-block" }} title={getTitle(props.message, props.starMessage)}>
            {element}
            {props.message.content.Media.caption == null ? null : <p style={{ margin: 0 }}>{<AutoLink text={props.message.content.Media.caption} />}</p>}
        </Card>
    </div>
}

interface ChatProps {
    /**
     * Message to display
     */
    message: message_t,
    /**
     * Callback when the content of a media message loads
     */
    onContentChange?: () => void,
    /**
     * Callback to (un)star a message
     * @param message Message to (un)star
     */
    starMessage?: (message: message_t) => void
}
export default function Chat(props: ChatProps) {
    if (getMessageType(props.message.content) === "text") {
        return <TextChat message={props.message as text_message_t} starMessage={props.starMessage} />
    }
    else if (getMessageType(props.message.content) === "media") {
        return <MediaChat onContentChange={props.onContentChange} message={props.message as media_message_t} starMessage={props.starMessage} />
    }
    else {
        return <SystemChat message={props.message as system_message_t} />
    }
}