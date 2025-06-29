import { FormEvent, RefObject, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { getBasename } from "./utilities";
import { invoke } from "@tauri-apps/api/core";
import { Toast } from "primereact/toast";
import { chat_files_t, chat_summary_t, global_settings_t, message_t } from "./types";
import { InputText } from "primereact/inputtext";
import { GlobalSettings } from "./Settings";
import { v4 as uuidv4 } from "uuid";


type returned_chat_summary_t = Omit<chat_summary_t, "first_sent" | "last_sent" | "last_message">
    & {
        first_sent: string | null,
        last_sent: string | null,
        last_message: null | (Omit<message_t, "timestamp"> & { timestamp: string })
    };

interface LoadChatsProps {
    /**
     * Reference for popup messages
     */
    toast: RefObject<Toast>,
    /**
     * Sets the chat summaries
     */
    setChatSummaries: (summaries: chat_summary_t[]) => void,
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

/**
 * Displays the initial chat loading interface
 */
export function LoadChats(props: LoadChatsProps) {
    const [selectedFiles, setSelectedFiles] = useState<chat_files_t[]>([]);
    const [showChooseChat, setShowChooseChat] = useState(false);
    const [selectedFilePath, setSelectedFilePath] = useState("");
    const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
    const [selectedChatName, setSelectedChatName] = useState("");
    const [editingChat, setEditingChat] = useState<chat_files_t["id"] | null>(null);
    const [loading, setLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    /**
     * Callback for selecting a chat text file
     */
    const chooseChat = async () => {
        const res = await open({
            directory: false,
            multiple: false,
            filters: [
                {
                    name: "Text file (*.txt)",
                    extensions: ["txt"],
                }
            ]
        });
        if (res != null && res.trim() !== "") {
            setSelectedFilePath(res);
        }
    }

    /**
     * Callback for selecting a directory
     */
    const chooseDirectory = async () => {
        const res = await open({
            directory: true,
            multiple: false
        });
        if (res != null && res.trim() !== "") {
            setSelectedDirectoryPath(res);
        }
    }

    /**
     * Cancels the choosing of a chat
     */
    const cancelChooseChat = () => {
        setShowChooseChat(false);
        setSelectedFilePath("");
        setSelectedDirectoryPath("");
        setSelectedChatName("");
        setEditingChat(null);
    }

    /**
     * Adds a new chat
     */
    const addChat = (e: FormEvent) => {
        e.preventDefault();
        if (selectedFilePath.trim() !== "" && selectedChatName.trim() !== "") {
            if (!selectedFiles.some(c => c.name === selectedChatName.trim())) {
                const new_chats = [...selectedFiles];
                new_chats.push({
                    id: uuidv4(),
                    file: selectedFilePath,
                    directory: selectedDirectoryPath.trim() === "" ? null : selectedDirectoryPath,
                    name: selectedChatName.trim(),
                    editable: true,
                    starred: [],
                    you: null,
                });
                setSelectedFiles(new_chats);
                cancelChooseChat();
            }
            else {
                props.toast.current?.show({ severity: "warn", summary: "Duplicate name", detail: "A chat with this name already exists" });
            }
        }
    }

    /**
     * Actually edits the chat
     */
    const doEditChat = (e: FormEvent) => {
        e.preventDefault();
        if (editingChat != null && selectedFilePath.trim() !== "" && selectedChatName.trim() !== "") {
            if (!selectedFiles.some(c => c.id !== editingChat && c.name === selectedChatName.trim())) {
                const new_chats: typeof selectedFiles = [];
                for (const c of selectedFiles) {
                    if (c.id === editingChat) {
                        new_chats.push({
                            id: c.id,
                            file: selectedFilePath,
                            directory: selectedDirectoryPath.trim() === "" ? null : selectedDirectoryPath,
                            name: selectedChatName.trim(),
                            editable: true,
                            starred: [],
                            you: null,
                        });
                    }
                    else {
                        new_chats.push(c);
                    }
                }
                setSelectedFiles(new_chats);
                cancelChooseChat();
            }
            else {
                props.toast.current?.show({ severity: "warn", summary: "Duplicate name", detail: "A chat with this name already exists" });
            }
        }
    }

    /**
     * Prepares to edit a chat
     * @param row Row to edit
     */
    const editChat = (row: chat_files_t) => {
        setSelectedFilePath(row.file);
        setSelectedDirectoryPath(row.directory ?? "");
        setSelectedChatName(row.name ?? "");
        setEditingChat(row.id);
        setShowChooseChat(true);
    }

    /**
     * Callback to delete the given `row`
     * @param row Row to delete
     */
    const deleteChat = (row: chat_files_t) => {
        invoke("remove_chat", { chat: row.name }).then(() => setSelectedFiles(prev => prev.filter((c) => c !== row)));
    }

    /**
     * Actually loads the chats
     */
    const doLoad = () => {
        setLoading(true);
        invoke("load_chats", { chats: selectedFiles })
            .then(res => {
                const resp = res as returned_chat_summary_t[];
                props.setChatSummaries(resp.map(summary => {
                    const first = summary.first_sent == null ? null : new Date(summary.first_sent);
                    const last = summary.last_sent == null ? null : new Date(summary.last_sent);
                    const message = summary.last_message == null ? null : { ...summary.last_message, timestamp: new Date(summary.last_message.timestamp) };
                    return {
                        ...summary,
                        first_sent: first,
                        last_sent: last,
                        last_message: message,
                    };
                }))
            })
            .catch(err => props.toast.current?.show({ severity: "error", summary: "Error loading chats", detail: err }))
            .finally(() => setLoading(false));
    }

    /**
     * Prepares to load the chats
     */
    const load = () => {
        const file_counts = new Set<string>();
        const used = new Set<string>();
        for (const c of selectedFiles) {
            if (file_counts.has(c.file)) {
                used.add(c.file);
            }
            else {
                file_counts.add(c.file);
            }
        }
        if (used.size > 0) {
            confirmDialog({
                header: "Duplicate files",
                message: <div>
                    {`The following file${used.size === 1 ? " is" : "s are"} used in multiple chats. Do you wish to load ${used.size === 1 ? "it" : "them"} multiple times?`}
                    <ul>{Array.from(used).slice(0, 5).map(c => <li>{c}</li>)}{used.size >= 5 ? <li>And {used.size - 4} more</li> : null}</ul>
                </div>,
                icon: "pi pi-question-circle",
                accept: doLoad
            });
        }
        else {
            doLoad();
        }
    }

    /**
     * Gets the chat delete/edit buttons
     * @param row Chat data
     * @returns Appropriate control buttons
     */
    const chatControls = (row: chat_files_t) => {
        return <div>
            {row.editable ? <Button icon="pi pi-pencil" outlined rounded style={{ marginRight: "7px" }} onClick={() => editChat(row)} tooltip="Edit" tooltipOptions={{ position: "bottom", showDelay: 300 }} /> : null}
            <Button icon="pi pi-minus-circle" outlined rounded severity="danger" onClick={() => deleteChat(row)} tooltip="Remove" tooltipOptions={{ position: "right", showDelay: 300 }} />
        </div>
    }

    /**
     * Chat selection table footer
     */
    const footer = <div style={{ textAlign: "center" }}>
        <Button label="Add chat" icon="pi pi-plus" onClick={() => setShowChooseChat(true)} />
    </div>

    // Get the chats that are already loaded
    useEffect(() => {
        invoke("get_saved_chats")
            .then((res) => {
                setSelectedFiles((res as { chats: chat_files_t[] }).chats);
            });
        invoke("get_set_theme_initial", { "theme": window.matchMedia("(prefers-color-scheme: dark)").matches ? "DARK" : "LIGHT" })
            .then((res) => {
                const resp = res as "LIGHT" | "DARK" | "UNSPECIFIED";
                props.changeGlobalSettings({ lightMode: resp !== "DARK" });
            });
    }, []);

    return (
        <>
            <ConfirmDialog />
            <Dialog header={`${editingChat == null ? "Choose" : "Edit"} chat`} visible={showChooseChat} onHide={cancelChooseChat} dismissableMask>
                <form onSubmit={editingChat == null ? addChat : doEditChat}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <Button type="button" label="Choose chat" icon="pi pi-file" onClick={chooseChat} />
                        <span style={{ marginLeft: "10px" }}>{getBasename(selectedFilePath)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: "15px" }}>
                        <Button type="button" label="Choose directory" icon="pi pi-folder" onClick={chooseDirectory} />
                        <span style={{ marginLeft: "10px" }}>{selectedDirectoryPath}</span>
                    </div>
                    <div style={{ marginTop: "15px" }}>
                        <label htmlFor="chat_name" style={{ marginRight: "5px" }}>Chat name:</label>
                        <InputText value={selectedChatName} onChange={e => setSelectedChatName(e.target.value)} id="chat_name" />
                    </div>
                    <div style={{ textAlign: "center", marginTop: "15px" }}>
                        {editingChat == null ?
                            <Button type="submit" label="Add chat" icon="pi pi-plus" severity="success" disabled={selectedFilePath.trim() === "" || selectedChatName.trim() === ""} />
                            : <Button type="submit" label="Edit chat" icon="pi pi-save" severity="success" disabled={selectedFilePath.trim() === "" || selectedChatName.trim() === ""} />
                        }
                        <Button type="reset" label="Cancel" icon="pi pi-times" severity="warning" style={{ marginLeft: "5px" }} onClick={cancelChooseChat} />
                    </div>
                </form>
            </Dialog>
            <GlobalSettings show={showSettings} setShow={setShowSettings} currentSettings={props.globalSettings} changeSettings={props.changeGlobalSettings} />
            <div style={{ display: "grid", height: "95vh", overflow: "hidden", justifyContent: "center", alignItems: "center" }}>
                <div>
                    <DataTable value={selectedFiles} scrollable scrollHeight="70vh" emptyMessage="No chats" footer={footer}>
                        <Column header="Chat file" field="file" body={row => getBasename(row.file)} sortable />
                        <Column header="Resource directory" field="directory" body={row => row.directory == null ? <i>Not selected</i> : row.directory} sortable />
                        <Column header="Chat name" field="name" body={row => row.name == null ? <i>None</i> : row.name} sortable />
                        <Column body={chatControls} />
                    </DataTable>
                    <div style={{ textAlign: "center", marginTop: "15px" }}>
                        <Button label="Load" icon="pi pi-arrow-right" severity="success" disabled={selectedFiles.length === 0} loading={loading} onClick={load} style={{ marginRight: "5px" }} />
                        <Button label="Settings" icon="pi pi-cog" onClick={() => setShowSettings(true)} />
                    </div>
                </div>
            </div>
        </>
    );
}