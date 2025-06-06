import { useRef, useState } from "react";
import "primereact/resources/themes/saga-green/theme.css";  // Or arya-green
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import "./App.css";
import { LoadChats } from "./LoadChats";
import { Toast } from "primereact/toast";
import { chat_summary_t } from "./types";
import ChatView from "./ChatView";


function App() {
    const [chatSummaries, setChatSummaries] = useState<chat_summary_t[]>([]);
    const toast = useRef<Toast>(null);

    return (
        <>
            <Toast ref={toast} />
            {chatSummaries.length === 0 ?
                <LoadChats toast={toast} setChatSummaries={setChatSummaries} />
                : <ChatView summaries={chatSummaries} />}
        </>
    );
}

export default App;
