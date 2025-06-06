import { useRef, useState } from "react";
import { VariableSizeList } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import { ListBox } from "primereact/listbox";
import { chat_summary_t, media_content_t, system_content_t, text_content_t } from "./types";
import { getMessageType } from "./utilities";
import Chat from "./Chat";

interface ChatViewProps {
    summaries: chat_summary_t[],
}

export default function ChatView(props: ChatViewProps) {
    const [selectedChat, setSelectedChat] = useState<chat_summary_t | null>(null);
    const listRef = useRef<VariableSizeList>(null);

    const changeSelectedChat = (s: chat_summary_t | null) => {
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

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 10fr" }}>
            <ListBox value={selectedChat} onChange={e => changeSelectedChat(e.value)} options={props.summaries} optionLabel="name" itemTemplate={chatTemplate} listStyle={{ height: "96vh" }} />
            {selectedChat == null ? null : <div>
                {/* <InfiniteLoader itemCount={selectedChat.number_of_messages}> */}
                <VariableSizeList height={100} width={"80vw"} itemSize={(index) => 25} itemCount={selectedChat.number_of_messages} ref={listRef}>
                    {({ index, style }) => <div style={style}>Row {index}</div>}
                </VariableSizeList>
                {/* </InfiniteLoader> */}
            </div>}
        </div>
    )
}