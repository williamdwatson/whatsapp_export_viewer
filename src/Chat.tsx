import { Avatar } from "primereact/avatar";
import { media_message_t, message_t, system_message_t, text_message_t } from "./types";
import { getBasename, getImageDimesions, getMessageType } from "./utilities";
import { Card } from "primereact/card";
import { ReactNode, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Image } from "primereact/image";
import { Button } from "primereact/button";
import { openPath } from "@tauri-apps/plugin-opener";
import AutoLink from "./AutoLink";

interface SystemChatProps {
    message: system_message_t
}
function SystemChat(props: SystemChatProps) {
    return <div>
        <Card style={{ width: "45vw", display: "inline-block" }}>
            <p style={{ margin: 0 }}>{props.message.content.System}</p>
        </Card>
    </div>
}

interface TextChatProps {
    message: text_message_t
}
function TextChat(props: TextChatProps) {
    return <div>
        <Avatar label={props.message.sender?.charAt(0)} shape="circle" size="large" style={{ marginRight: "5px" }} />
        <Card style={{ width: undefined, maxWidth: "45vw", display: "inline-block" }} title={props.message.sender}>
            <p style={{ margin: 0 }}><AutoLink text={props.message.content.Text} /></p>
        </Card>
    </div>
}

interface MediaChatProps {
    message: media_message_t
}
function MediaChat(props: MediaChatProps) {
    const [loadingFile, setLoadingFile] = useState(false);
    let element: ReactNode;
    if (props.message.content.Media.media_type === "PHOTO") {
        element = props.message.content.Media.path == null ? <i>Photo unavailable</i>
            : <Image imageStyle={{ maxHeight: "20vh", maxWidth: "45vh" }} src={convertFileSrc(props.message.content.Media.path)} preview />
    }
    else if (props.message.content.Media.media_type === "VIDEO") {
        element = props.message.content.Media.path == null ? <i>Video unavailable</i> : <video style={{ maxHeight: "20vh", maxWidth: "45vh" }} controls src={convertFileSrc(props.message.content.Media.path)} />
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
        <Card style={{ width: undefined, display: "inline-block" }} title={props.message.sender}>
            {element}
        </Card>
    </div>
}

interface ChatProps {
    message: message_t,
}
export default function Chat(props: ChatProps) {
    if (getMessageType(props.message.content) === "text") {
        return <TextChat message={props.message as text_message_t} />
    }
    else if (getMessageType(props.message.content) === "media") {
        return <MediaChat message={props.message as media_message_t} />
    }
    else {
        return <SystemChat message={props.message as system_message_t} />
    }
}