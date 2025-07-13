import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import Chat from "./Chat";
import { Divider } from "primereact/divider";
import { Message } from "./messages";

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
    starredMessages: Message[],
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
        props.setShow(false);
        props.jumpToMessage(idx);
    }

    return <Dialog header="Starred chats" visible={props.show} onHide={() => props.setShow(false)} dismissableMask>
        <div className="text-center">
            <Button label="Jump to top" icon="pi pi-arrow-up" className="right-pad" onClick={() => scrollToIdx(0)} />
            <Button label="Jump to bottom" icon="pi pi-arrow-down" onClick={() => scrollToIdx(props.totalNumberMessages - 1)} />
        </div>
        {props.starredMessages.length === 0 ? null
            :
            props.starredMessages.map(m =>
                <div style={{ marginTop: "10px", cursor: "pointer" }} onClick={() => scrollToIdx(m.idx)}>
                    <Chat message={m} systemMessageWidth={"45vw"} showPreview={false} />
                    <Divider />
                </div>)
        }

    </Dialog>
}