import { invoke } from "@tauri-apps/api/core";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { FormEvent, RefObject, useEffect, useRef, useState } from "react";
import { Toast } from "primereact/toast";
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from "react-virtualized";
import Chat from "./Chat";
import { Divider } from "primereact/divider";
import { BulkMediaMessage, Message } from "./messages";

interface SearchProps {
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
     * Name of the chat to search
     */
    chat?: string,
    /**
     * All available messages
     */
    messages: Message[],
    /**
     * Popup reference
     */
    toast: RefObject<Toast>,
    /**
     * Scrolls to the specified chat index
     * @param idx Index to scroll to
     */
    jumpToMessage: (idx: number) => void

}

/**
 * Dialog for searching
 */
export default function Search(props: SearchProps) {
    const [search, setSearch] = useState("");
    const [foundIdxes, setFoundIdxes] = useState<number[] | null>(null);
    const cache = useRef(
        new CellMeasurerCache({
            fixedWidth: true,
            defaultHeight: 100,
        })
    );

    // "Auto"focus the searchbox when the popup opens
    useEffect(() => {
        if (props.show) {
            setTimeout(() => document.getElementById("search")?.focus(), 50);
        }
    }, [props.show]);

    /**
     * Searches for the given string
     * @param e Form submit event
     */
    const doSearch = (e: FormEvent) => {
        e.preventDefault();
        const searched = (document.getElementById("search") as HTMLInputElement).value;
        if (props.chat != null && searched.trim() !== "") {
            invoke("search", { chat: props.chat, search: searched })
                .then(res => {
                    const resp = res as number[];
                    const found_idxes: typeof foundIdxes = [];
                    for (const idx of resp) {
                        let i = props.messages.findIndex(m => m.backend_idx === idx);
                        if (i === -1) {
                            for (let j = 0; j < props.messages.length; j++) {
                                const m = props.messages[j];
                                if (m instanceof BulkMediaMessage && m.content.some(c => c.backend_idx === idx)) {
                                    i = j;
                                    break;
                                }
                            }
                        }
                        found_idxes.push(i);
                    }
                    setFoundIdxes(found_idxes);
                    setSearch(searched);
                    cache.current.clearAll();
                })
                .catch(err => props.toast.current?.show({ severity: "error", summary: "Error searching", detail: err }));
        }
    }

    /**
     * Scrolls to the specified index and closes the popup
     * @param idx Index to scroll to
     */
    const scrollToIdx = (idx: number) => {
        props.jumpToMessage(idx);
        hide();
    }

    /**
     * Callback to clear everything and hide the popup
     */
    const hide = () => {
        props.setShow(false);
        setFoundIdxes(null);
        cache.current.clearAll();
    }

    return <Dialog header="Search" visible={props.show} onHide={hide} dismissableMask style={{ width: "50vw" }}>
        <form style={{ textAlign: "center", marginTop: "5px", marginBottom: "15px" }} onSubmit={doSearch}>
            <InputText id="search" placeholder="Search" className="right-pad" type="search" />
            <Button type="submit" label="Search" icon="pi pi-search" />
        </form>
        {foundIdxes == null ?
            null :
            foundIdxes.length === 0 ?
                <div style={{ textAlign: "center", marginTop: "4vh" }}><i style={{ fontSize: "large" }}>No results</i></div>
                : <div style={{ height: "50vh" }}>
                    <AutoSizer style={{ paddingLeft: "5px" }}>
                        {({ height, width }) => (
                            <List
                                width={width}
                                height={height}
                                rowCount={foundIdxes.length}
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
                                        {({ measure }) => <div style={{ ...style, paddingTop: "5px", paddingBottom: "5px", cursor: "pointer" }} onClick={() => scrollToIdx(foundIdxes[index])}>
                                            <Chat
                                                highlightText={search.trim() !== "" ? search : undefined}
                                                message={props.messages[foundIdxes[index]]}
                                                onContentChange={measure}
                                                showAvatar={false}
                                                showPreview={false}
                                                systemMessageWidth={"45vw"}
                                            />
                                            <Divider />
                                        </div>}
                                    </CellMeasurer>
                                )}
                            />
                        )}
                    </AutoSizer>
                </div>
        }
    </Dialog>
}