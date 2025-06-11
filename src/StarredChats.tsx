import { Dialog } from "primereact/dialog";
import { message_t } from "./types";
import { Button } from "primereact/button";
import { ScrollPanel } from "primereact/scrollpanel";
import Chat from "./Chat";
import { Divider } from "primereact/divider";

interface StarredChatProps {
    /**
     * Whether to show the popup
     */
    show: boolean,
    /**
     * Sets whether the popup should be shown
     * @param visible Whether the popup should be visible
     */
    setShow: (visible: boolean) => void,
    /**
     * Starred messages to show
     */
    starredMessages: message_t[],
    /**
     * Total number of messages
     */
    totalNumberMessages: number,
    /**
     * Scrolls to the specified chat index
     * @param idx Index to scroll to
     */
    jumpToMessage: (idx: number) => void
}

/**
 * Dialog for showing starred chats
 */
export default function StarredChats(props: StarredChatProps) {

    /**
     * Scrolls to the specified index and closes the popup
     * @param idx Index to scroll to
     */
    const scrollToIdx = (idx: number) => {
        console.log(idx);
        props.setShow(false);
        props.jumpToMessage(idx);
    }

    return <Dialog visible={props.show} onHide={() => props.setShow(false)} dismissableMask>
        <div style={{ textAlign: "center" }}>
            <Button label="Jump to top" icon="pi pi-arrow-up" style={{ marginRight: "5px" }} onClick={() => scrollToIdx(0)} />
            <Button label="Jump to bottom" icon="pi pi-arrow-down" onClick={() => scrollToIdx(props.totalNumberMessages - 1)} />
        </div>
        {props.starredMessages.length === 0 ? null
            :
            props.starredMessages.map(m =>
                <div style={{ marginTop: "10px", cursor: "pointer" }} onClick={() => scrollToIdx(m.idx)}>
                    <Chat message={m} />
                    <Divider />
                </div>)
        }

    </Dialog>
}