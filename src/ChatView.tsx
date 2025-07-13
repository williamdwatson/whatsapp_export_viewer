import { RefObject, useEffect, useRef, useState } from "react";
import { ListBox } from "primereact/listbox";
import { chat_settings_t, chat_summary_t, global_settings_t, media_content_t, media_t, returned_chat_t, statistics_t, system_content_t, text_content_t } from "./types";
import { getMessageType } from "./utilities";
import Chat from "./Chat";
import { BulkMediaMessage, MediaMessage, Message, SystemMessage, TextMessage } from "./messages";
import { invoke } from "@tauri-apps/api/core";
import { Toast } from "primereact/toast";
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from "react-virtualized";
import { Toolbar } from "primereact/toolbar";
import { Button } from "primereact/button";
import StarredChats from "./StarredChats";
import Search from "./Search";
import Statistics from "./Statistics";
import { ChatSettings } from "./Settings";


interface ChatViewProps {
    /**
     * Summaries of each chat
     */
    summaries: chat_summary_t[],
    /**
     * Function to switch to the chat loading view
     */
    changeToLoad: () => void,
    /**
     * Popup toast message reference
     */
    toast: RefObject<Toast>,
    /**
     * Global app settings
     */
    globalSettings: global_settings_t,
    /**
     * Changes the global app settings
     * @param newSettings New global settings
     */
    changeGlobalSettings: (newSettings: global_settings_t) => void
}

export default function ChatView(props: ChatViewProps) {
    const default_settings: Record<string, chat_settings_t> = {};
    props.summaries.forEach(s => { default_settings[s.name] = { you: null } });
    const [currentSettings, setCurrentSettings] = useState<typeof default_settings>(default_settings);
    const [selectedChat, setSelectedChat] = useState<chat_summary_t | null>(null);
    const [loadedMessages, setLoadedMessages] = useState<Message[] | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [showStarred, setShowStarred] = useState(false);
    const [starredMessages, setStarredMessages] = useState<Message[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [stats, setStats] = useState<statistics_t>({});
    const [showStatistics, setShowStatistics] = useState(false);
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
                    const loaded_messages: typeof loadedMessages = [];
                    let i = 0;
                    while (i < resp.messages.length) {
                        const r = resp.messages[i];
                        if (getMessageType(r.content) === "text") {
                            loaded_messages.push(new TextMessage(r.timestamp, r.sender, (r.content as text_content_t).Text, loaded_messages.length, r.idx, r.starred));
                        }
                        else if (getMessageType(r.content) === "media") {
                            const c = (r.content as media_content_t).Media;
                            if (c.caption == null && i < resp.messages.length - 1) {
                                let next_non_media_idx = i + 1;
                                const r_date = new Date(r.timestamp).getTime();
                                while (next_non_media_idx < resp.messages.length) {
                                    const next_message = resp.messages[next_non_media_idx];
                                    const next_date = new Date(next_message.timestamp).getTime();
                                    if (getMessageType(next_message.content) === "media" &&
                                        next_message.sender === r.sender &&
                                        (next_date - r_date) < 5 * 60 * 1000 &&
                                        (next_message.content as media_content_t).Media.caption == null &&
                                        (next_message.content as media_content_t).Media.path != null &&
                                        ["PHOTO", "VIDEO"].includes((next_message.content as media_content_t).Media.media_type)
                                    ) {
                                        next_non_media_idx++;
                                    }
                                    else {
                                        break;
                                    }
                                }
                                if (next_non_media_idx - i > 3) {
                                    const media_types: media_t["media_type"][] = [];
                                    const paths = [];
                                    const backend_idxes = [];
                                    const timestamps = [];
                                    for (let j = i; j < next_non_media_idx; j++) {
                                        media_types.push((resp.messages[j].content as media_content_t).Media.media_type);
                                        paths.push((resp.messages[j].content as media_content_t).Media.path!);
                                        backend_idxes.push(resp.messages[j].idx);
                                        timestamps.push(resp.messages[j].timestamp);
                                    }
                                    loaded_messages.push(new BulkMediaMessage(r.timestamp, r.sender, media_types, paths, backend_idxes, timestamps, loaded_messages.length, r.idx, r.starred));
                                    i = next_non_media_idx;
                                    continue;
                                }
                                else {
                                    loaded_messages.push(new MediaMessage(r.timestamp, r.sender, c.media_type, c.path, c.caption, loaded_messages.length, r.idx, r.starred))
                                }
                            }
                            else {
                                loaded_messages.push(new MediaMessage(r.timestamp, r.sender, c.media_type, c.path, c.caption, loaded_messages.length, r.idx, r.starred))
                            }
                        }
                        else {
                            loaded_messages.push(new SystemMessage(r.timestamp, r.sender, (r.content as system_content_t).System, loaded_messages.length, r.idx, r.starred));
                        }
                        i++;
                    }
                    setLoadedMessages(loaded_messages);
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Error getting chat", detail: err }));
        }

        setSelectedChat(s);
    }

    /**
     * Callback to (un)star a `message`
     * @param message Message to (un)star
     */
    const starMessage = (message: Message) => {
        if (selectedChat != null && loadedMessages != null) {
            invoke("star_message", { chat: selectedChat?.name, messageIdx: message.backend_idx })
                .then(() => {
                    const new_chat = [...loadedMessages];
                    new_chat[message.idx].starred = !message.starred;
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
                    const starred_messages: typeof starredMessages = [];
                    for (const m of resp) {
                        let idx = loadedMessages!.findIndex(mm => mm.backend_idx === m.idx);
                        if (idx === -1 && getMessageType(m.content) === "media") {
                            for (let i = 0; i < loadedMessages!.length; i++) {
                                const mm = loadedMessages![i];
                                if (mm instanceof BulkMediaMessage && mm.content.some(c => c.backend_idx === m.idx)) {
                                    idx = i;
                                    break;
                                }
                            }
                        }
                        if (getMessageType(m.content) === "media") {
                            const c = (m.content as media_content_t).Media;
                            starred_messages.push(new MediaMessage(m.timestamp, m.sender, c.media_type, c.path, c.caption, idx, m.idx, m.starred));
                        }
                        else if (getMessageType(m.content) === "text") {
                            starred_messages.push(new TextMessage(m.timestamp, m.sender, (m.content as text_content_t).Text, idx, m.idx, m.starred));
                        }
                        else {
                            starred_messages.push(new SystemMessage(m.timestamp, m.sender, (m.content as system_content_t).System, idx, m.idx, m.starred));
                        }
                    }
                    setStarredMessages(starred_messages);
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Failed to get starred messages", detail: err }))
                .finally(() => setShowStarred(true));
        }
    }

    /**
     * Loads the chat's statistics
     */
    const loadStats = () => {
        if (selectedChat != null) {
            invoke("get_stats", { chat: selectedChat.name })
                .then(res => {
                    setStats(res as statistics_t);
                    setShowStatistics(true);
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Error getting statistics", detail: err }));
        }
    }

    // Update "you" for each chat when summaries are recieved
    useEffect(() => {
        const settings = { ...currentSettings };
        for (const summary of props.summaries) {
            settings[summary.name] = { ...settings[summary.name], you: summary.you };
        }
        setCurrentSettings(settings);
    }, [props.summaries]);

    const end = <div>
        <Button type="button" icon="pi pi-search" rounded onClick={() => setShowSearch(true)} disabled={selectedChat == null} />
        <Button type="button" icon="pi pi-star" rounded style={{ marginLeft: "10px" }} onClick={loadStarred} disabled={selectedChat == null} />
        <Button type="button" icon="pi pi-cog" rounded style={{ marginLeft: "10px", marginRight: "10px" }} onClick={() => setShowSettings(true)} disabled={selectedChat == null} />
        <Button type="button" icon="pi pi-chart-bar" rounded onClick={loadStats} disabled={selectedChat == null} />
    </div>

    return (
        <>
            <Search show={showSearch} setShow={setShowSearch} chat={selectedChat?.name} toast={props.toast} messages={loadedMessages ?? []} jumpToMessage={(idx) => listRef.current?.scrollToRow(idx)} />
            <StarredChats show={showStarred} setShow={setShowStarred} starredMessages={starredMessages} totalNumberMessages={(loadedMessages ?? []).length} jumpToMessage={(idx) => listRef.current?.scrollToRow(idx)} />
            {selectedChat != null ?
                <ChatSettings
                    show={showSettings}
                    setShow={setShowSettings}
                    senders={new Set(loadedMessages?.filter(m => m.sender != null).map(m => m.sender!) ?? [])}
                    currentChatSettings={currentSettings[selectedChat.name]}
                    currentGlobalSettings={props.globalSettings}
                    changeSettings={(c, g) => {
                        const current_settings = { ...currentSettings };
                        current_settings[selectedChat.name] = c;
                        setCurrentSettings(current_settings);
                        invoke("set_you", { chat: selectedChat.name, you: c.you });
                        props.changeGlobalSettings(g);
                    }}
                />
                : null}
            <Statistics show={showStatistics} setShow={setShowStatistics} stats={stats} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 10fr" }}>
                <div>
                    <div style={{ textAlign: "center", width: "100%", marginBottom: "5px" }}>
                        <Button label="Update chats" icon="pi pi-pencil" onClick={props.changeToLoad} />
                    </div>
                    <ListBox value={selectedChat} onChange={e => changeSelectedChat(e.value)} options={props.summaries} optionLabel="name" itemTemplate={chatTemplate} listStyle={{ height: "92vh" }} />
                </div>
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
                                            {({ measure }) => {
                                                const fromYou = loadedMessages[index].sender != null && loadedMessages[index].sender === currentSettings[selectedChat.name].you;
                                                return <div style={{ ...style, paddingTop: "5px", paddingBottom: "5px" }}>
                                                    <Chat message={loadedMessages[index]} onContentChange={measure} starMessage={starMessage} systemMessageWidth={"80vw"} fromYou={fromYou} />
                                                </div>
                                            }}
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