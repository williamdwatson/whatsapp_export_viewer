import { RefObject, useRef, useState } from "react";
import { ListOnItemsRenderedProps, VariableSizeList } from "react-window";
import { ListBox } from "primereact/listbox";
import { chat_summary_t, media_content_t, message_t, system_content_t, text_content_t } from "./types";
import { getMessageType } from "./utilities";
import Chat from "./Chat";
import { invoke } from "@tauri-apps/api/core";
import { Toast } from "primereact/toast";
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from "react-virtualized";


interface ChatViewProps {
    summaries: chat_summary_t[],
    toast: RefObject<Toast>
}

type returned_chat_t = Omit<message_t, "timestamp"> & { timestamp: string };

export default function ChatView(props: ChatViewProps) {
    const [selectedChat, setSelectedChat] = useState<chat_summary_t | null>(null);
    const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
    const [loadedMessages, setLoadedMessages] = useState<message_t[] | null>(null);
    const listRef = useRef<VariableSizeList>(null);
    const estimatedDefaultHeight = 100;

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
                        console.log(r);
                        return {
                            timestamp: new Date(r.timestamp),
                            sender: r.sender,
                            content: r.content
                        }
                    }));
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Error getting chat", detail: err }));
        }

        setSelectedChat(s);
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
            <b style={{ display: "inline-block", width: "10vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary.name}</b>
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

    const getHeight = (index: number) => {
        return measuredHeights.get(index) ?? estimatedDefaultHeight;
    }

    const updateHeights = (p: ListOnItemsRenderedProps) => {
        let new_heights: null | typeof measuredHeights = null;
        for (let i = p.overscanStartIndex; i <= p.overscanStopIndex; i++) {
            if (!measuredHeights.has(i)) {
                if (new_heights == null) {
                    new_heights = new Map(measuredHeights);
                }
                const el = document.getElementById(`chat-${i}`);
                if (el != null) {
                    new_heights.set(i, el.getBoundingClientRect().height);
                }
            }
        }
        if (new_heights != null) {
            setMeasuredHeights(new_heights);
        }
    }



    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 10fr" }}>
            <ListBox value={selectedChat} onChange={e => changeSelectedChat(e.value)} options={props.summaries} optionLabel="name" itemTemplate={chatTemplate} listStyle={{ height: "96vh" }} />
            {selectedChat == null || loadedMessages == null ? null : <div>
                <AutoSizer style={{ paddingLeft: "5px" }}>
                    {({ height, width }) => (
                        <List
                            width={width}
                            height={height}
                            rowCount={loadedMessages.length}
                            deferredMeasurementCache={cache.current}
                            rowHeight={cache.current.rowHeight}
                            rowRenderer={({ key, index, style, parent }) => (
                                <CellMeasurer
                                    key={key}
                                    cache={cache.current}
                                    parent={parent}
                                    columnIndex={0}
                                    rowIndex={index}
                                >
                                    {({ measure }) => <div style={{ ...style, paddingTop: "5px", paddingBottom: "5px" }}>
                                        <Chat message={loadedMessages[index]} onContentChange={measure} />
                                    </div>}
                                </CellMeasurer>
                            )}
                        />
                    )}
                </AutoSizer>
            </div>}
        </div>
    )
}