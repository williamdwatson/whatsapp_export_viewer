import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { FormEvent, useEffect, useState } from "react";
import { settings_t } from "./types";
import { InputSwitch } from "primereact/inputswitch";

interface SettingsProps {
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
     * People who have sent a message before
     */
    senders: Set<string>,
    /**
     * Current settings
     */
    currentSettings: settings_t,
    /**
     * Updates the current settings
     * @param newSettings New settings
     */
    changeSettings: (newSettings: settings_t) => void
}

/**
 * Dialog for settings
 */
export default function Settings(props: SettingsProps) {
    const [you, setYou] = useState<string | null>(props.currentSettings.you);
    const [lightMode, setLightMode] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);

    /**
     * Resets the settings
     * @param e Form reset event
     */
    const reset = (e: FormEvent) => {
        e.preventDefault();
        setYou(null);
        setLightMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    /**
     * Cancels the changes
     */
    const cancel = () => {
        props.setShow(false);
    }

    /**
     * Changes the settings
     * @param e Form submit event
     */
    const submit = (e: FormEvent) => {
        e.preventDefault();
        props.changeSettings({
            you,
        });
        cancel();
    }

    useEffect(() => {
        const themeLink = document.getElementById("theme-css") as HTMLLinkElement;
        if (themeLink) {
            themeLink.href = `themes/${lightMode ? "light" : "dark"}_theme.css`;
        }
    }, [lightMode]);

    return <Dialog header="Settings" visible={props.show} onHide={cancel} dismissableMask>
        <form onSubmit={submit} onReset={reset}>
            <div style={{ textAlign: "center", marginTop: "5px" }}>
                <label htmlFor="you" style={{ marginRight: "5px" }}>You:</label>
                <Dropdown value={you} onChange={e => setYou(e.value)} options={Array.from(props.senders)} inputId="you" />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: "10px" }}>
                <span style={{ marginRight: "5px", cursor: "pointer" }} aria-label="Dark mode" onClick={() => setLightMode(false)}>Dark</span>
                <InputSwitch checked={lightMode} onChange={e => setLightMode(e.value)} style={{ marginRight: "5px" }} />
                <span style={{ cursor: "pointer" }} aria-label="Light mode" onClick={() => setLightMode(true)}>Light</span>
            </div>
            <div style={{ textAlign: "center", marginTop: "15px" }}>
                <Button label="Save" icon="pi pi-save" severity="success" type="submit" style={{ marginRight: "5px" }} />
                <Button label="Reset" icon="pi pi-refresh" severity="warning" type="reset" style={{ marginRight: "5px" }} />
                <Button label="Cancel" icon="pi pi-times" severity="secondary" outlined type="button" onClick={cancel} />
            </div>
        </form>
    </Dialog>
}