import { useRef, useState } from "react";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import "./App.css";
import { LoadChats } from "./load_chats";
import { Toast } from "primereact/toast";


function App() {
    const [loadedChats, setLoadedChats] = useState([]);
    const toast = useRef<Toast>(null);

    return (
        <>
            <Toast ref={toast} />
            {loadedChats.length === 0 ? <LoadChats toast={toast} /> : null}
        </>
    );
}

export default App;
