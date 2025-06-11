import { RefObject, useRef, useState } from "react";
import { ListOnItemsRenderedProps, VariableSizeList } from "react-window";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { ListBox } from "primereact/listbox";
import { chat_summary_t, media_content_t, message_t, system_content_t, text_content_t } from "./types";
import { getMessageType } from "./utilities";
import Chat from "./Chat";
import { invoke } from "@tauri-apps/api/core";
import { Toast } from "primereact/toast";
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from "react-virtualized";
import { Toolbar } from "primereact/toolbar";
import { Button } from "primereact/button";
import StarredChats from "./StarredChats";


interface ChatViewProps {
    /**
     * Summaries of each chat
     */
    summaries: chat_summary_t[],
    /**
     * Popup toast message reference
     */
    toast: RefObject<Toast>
}

type returned_chat_t = Omit<message_t, "timestamp"> & { timestamp: string };

export default function ChatView(props: ChatViewProps) {
    const [selectedChat, setSelectedChat] = useState<chat_summary_t | null>(null);
    const [loadedMessages, setLoadedMessages] = useState<message_t[] | null>(null);
    const [showStarred, setShowStarred] = useState(false);
    const [starredMessages, setStarredMessages] = useState<message_t[]>([]);
    const listRef = useRef<List>(null);

    const cache = useRef(
        new CellMeasurerCache({
            fixedWidth: true,
            defaultHeight: 100,
        })
    );

    /**
     * Callback when a new chat is selected
     * @param s Selected chat
     */
    const changeSelectedChat = (s: chat_summary_t | null) => {
        if (s != null) {
            invoke("get_chat", { chat: s.name })
                .then(res => {
                    const resp = res as { directories: string[], name: string, messages: returned_chat_t[] };
                    setLoadedMessages(resp.messages.map(r => {
                        return {
                            idx: r.idx,
                            timestamp: new Date(r.timestamp),
                            sender: r.sender,
                            content: r.content,
                            starred: r.starred,
                        }
                    }));
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Error getting chat", detail: err }));
        }

        setSelectedChat(s);
    }

    /**
     * Callback to (un)star a `message`
     * @param message Message to (un)star
     */
    const starMessage = (message: message_t) => {
        if (selectedChat != null && loadedMessages != null) {
            invoke("star_message", { chat: selectedChat?.name, messageIdx: message.idx })
                .then(() => {
                    const new_chat = [...loadedMessages];
                    new_chat[message.idx].starred = !new_chat[message.idx].starred;
                    setLoadedMessages(new_chat);
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Failed to star message", detail: err }));
        }
    }

    /**
     * Gets the appropriate text for the given media content
     * @param media_content Media content
     * @returns Text appropriate for the `media_content`
     */
    const getMediaText = (media_content: media_content_t) => {
        if (media_content.Media.media_type === "PHOTO") {
            return "photo";
        }
        else if (media_content.Media.media_type === "VIDEO") {
            return "video";
        }
        else if (media_content.Media.media_type === "AUDIO") {
            return "recording";
        }
        return "file";
    }

    /**
     * Formats a chat `summary`
     * @param summary Chat summary
     * @returns Formatted chat summary
     */
    const chatTemplate = (summary: chat_summary_t) => {
        const message_type = getMessageType(summary.last_message?.content);
        const message = message_type == null ? null
            : message_type === "text" ? (summary.last_message!.content as text_content_t).Text
                : message_type === "system" ? (summary.last_message!.content as system_content_t).System
                    : `sent a ${getMediaText(summary.last_message!.content as media_content_t)}`;
        return <div>
            <b style={{ display: "inline-block", width: "5.25vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary.name}</b>
            <span style={{ float: "right" }}>{summary.last_sent?.toLocaleDateString()}</span>
            <br />
            {summary.last_message == null ? null
                : <span style={{ fontSize: "smaller", display: "block", maxWidth: "15vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {summary.last_message.sender == null || message_type === "system" ? null : summary.last_message.sender + ": "}
                    {message}
                </span>
            }
        </div>
    }

    /**
     * Gets the starred messages
     */
    const loadStarred = () => {
        if (selectedChat != null) {
            invoke("get_starred", { chat: selectedChat.name })
                .then(res => {
                    const resp = res as returned_chat_t[];
                    setStarredMessages(resp.map(c => {
                        return {
                            timestamp: new Date(c.timestamp),
                            sender: c.sender,
                            content: c.content,
                            starred: c.starred,
                            idx: c.idx
                        }
                    }));
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Failed to get starred messages", detail: err }))
                .finally(() => setShowStarred(true));
        }
    }

    const end = <form>
        <IconField iconPosition="left" style={{ display: "inline-block" }}>
            <InputIcon className="pi pi-search"> </InputIcon>
            <InputText placeholder="Search" />
        </IconField>
        <Button type="button" icon="pi pi-star" rounded style={{ marginLeft: "10px" }} onClick={loadStarred} />
        <Button type="button" icon="pi pi-filter" rounded style={{ marginLeft: "10px" }} />
        <Button type="button" icon="pi pi-cog" rounded style={{ marginLeft: "10px", marginRight: "10px" }} />
        <Button type="button" icon="pi pi-chart-bar" rounded />
    </form>

    return (
        <>
            <StarredChats show={showStarred} setShow={setShowStarred} starredMessages={starredMessages} totalNumberMessages={(loadedMessages ?? []).length} jumpToMessage={(idx) => listRef.current?.scrollToRow(idx)} />
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 10fr" }}>
                <ListBox value={selectedChat} onChange={e => changeSelectedChat(e.value)} options={props.summaries} optionLabel="name" itemTemplate={chatTemplate} listStyle={{ height: "97vh" }} />
                {selectedChat == null || loadedMessages == null ? null :
                    <div style={{ display: "flex", flexDirection: "column", height: "89vh" }}>
                        <Toolbar end={end} />
                        <AutoSizer style={{ paddingLeft: "5px" }}>
                            {({ height, width }) => (
                                <List
                                    ref={listRef}
                                    width={width}
                                    height={height}
                                    rowCount={loadedMessages.length}
                                    deferredMeasurementCache={cache.current}
                                    rowHeight={cache.current.rowHeight}
                                    scrollToAlignment="start"
                                    rowRenderer={({ key, index, style, parent }) => (
                                        <CellMeasurer
                                            key={key}
                                            cache={cache.current}
                                            parent={parent}
                                            columnIndex={0}
                                            rowIndex={index}
                                        >
                                            {({ measure }) => <div style={{ ...style, paddingTop: "5px", paddingBottom: "5px" }}>
                                                <Chat message={loadedMessages[index]} onContentChange={measure} starMessage={starMessage} />
                                            </div>}
                                        </CellMeasurer>
                                    )}
                                />
                            )}
                        </AutoSizer>
                    </div>}
            </div>
        </>
    )
}