import { useEffect, useRef, useState } from "react";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import "./App.css";
import { LoadChats } from "./LoadChats";
import { Toast } from "primereact/toast";
import { chat_summary_t, global_settings_t } from "./types";
import ChatView from "./ChatView";
import { invoke } from "@tauri-apps/api/core";


function App() {
    const [currentPage, setCurrentPage] = useState<"load" | "view">("load");
    const [chatSummaries, setChatSummaries] = useState<chat_summary_t[]>([]);
    const [globalSettings, setGlobalSettings] = useState<global_settings_t>({ lightMode: !window.matchMedia("(prefers-color-scheme: dark)").matches });
    const toast = useRef<Toast>(null);

    /**
     * Sets the chat summaries and navigates to the chat view
     * @param summaries New chat summaries
     */
    const updateChatSummaries = (summaries: chat_summary_t[]) => {
        setChatSummaries(summaries);
        setCurrentPage("view");
    }

    // Callback whenever the global settings (i.e. the theme) changes
    useEffect(() => {
        const themeLink = document.getElementById("theme-css") as HTMLLinkElement;
        if (themeLink) {
            themeLink.href = `themes/${globalSettings.lightMode ? "light" : "dark"}_theme.css`;
        }
        invoke("set_theme", { theme: !globalSettings.lightMode ? "DARK" : "LIGHT" });
    }, [globalSettings]);

    return (
        <>
            <Toast ref={toast} />
            {currentPage === "load" ?
                <LoadChats toast={toast} setChatSummaries={updateChatSummaries} globalSettings={globalSettings} changeGlobalSettings={setGlobalSettings} />
                : <ChatView summaries={chatSummaries} changeToLoad={() => setCurrentPage("load")} toast={toast} globalSettings={globalSettings} changeGlobalSettings={setGlobalSettings} />}
        </>
    );
}

export default App;
