import { FormEvent, RefObject, useState } from "react";
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
            if (!selectedFiles.some(c => c.chatName === selectedChatName.trim())) {
                const new_chats = [...selectedFiles];
                new_chats.push({
                    id: new_chats.length === 0 ? 1 : Math.max(...new_chats.map(c => c.id)) + 1,
                    chatFile: selectedFilePath,
                    chatDirectory: selectedDirectoryPath.trim() === "" ? null : selectedDirectoryPath,
                    chatName: selectedChatName.trim(),
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
            if (!selectedFiles.some(c => c.id !== editingChat && c.chatName === selectedChatName.trim())) {
                const new_chats: typeof selectedFiles = [];
                for (const c of selectedFiles) {
                    if (c.id === editingChat) {
                        new_chats.push({
                            id: c.id,
                            chatFile: selectedFilePath,
                            chatDirectory: selectedDirectoryPath.trim() === "" ? null : selectedDirectoryPath,
                            chatName: selectedChatName.trim(),
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
        setSelectedFilePath(row.chatFile);
        setSelectedDirectoryPath(row.chatDirectory ?? "");
        setSelectedChatName(row.chatName ?? "");
        setEditingChat(row.id);
        setShowChooseChat(true);
    }

    /**
     * Callback to delete the given `row`
     * @param row Row to delete
     */
    const deleteChat = (row: chat_files_t) => {
        setSelectedFiles(prev => prev.filter((c) => c !== row));
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
                        name: summary.name,
                        first_sent: first,
                        last_sent: last,
                        last_message: message,
                        number_of_messages: summary.number_of_messages,
                        starred: summary.starred,
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
        const used: typeof selectedFiles = [];
        for (const c of selectedFiles) {
            if (file_counts.has(c.chatFile)) {
                used.push(c);
            }
            else {
                file_counts.add(c.chatFile);
            }
        }
        if (used.length > 0) {
            confirmDialog({
                header: "Duplicate files",
                message: <div>
                    {`The following file${used.length === 1 ? " is" : "s are"} used in multiple chats. Do you wish to load them multiple times?`}
                    <ul>{used.slice(0, 5).map(c => <li>{c.chatFile}</li>)}{used.length >= 5 ? <li>And {used.length - 4} more</li> : null}</ul>
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
            <Button icon="pi pi-pencil" outlined rounded style={{ marginRight: "7px" }} onClick={() => editChat(row)} />
            <Button icon="pi pi-trash" outlined rounded severity="danger" onClick={() => deleteChat(row)} />
        </div>
    }

    /**
     * Chat selection table footer
     */
    const footer = <div style={{ textAlign: "center" }}>
        <Button label="Add chat" icon="pi pi-plus" onClick={() => setShowChooseChat(true)} />
    </div>

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
                        <Column header="Chat file" field="chatFile" body={row => getBasename(row.chatFile)} sortable />
                        <Column header="Resource directory" field="chatDirectory" body={row => row.chatDirectory == null ? <i>Not selected</i> : row.chatDirectory} sortable />
                        <Column header="Chat name" field="chatName" body={row => row.chatName == null ? <i>None</i> : row.chatName} sortable />
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