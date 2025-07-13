import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { FormEvent, useState } from "react";
import { chat_settings_t, global_settings_t } from "./types";
import { InputSwitch } from "primereact/inputswitch";

interface ChatSettingsProps {
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
    currentChatSettings: chat_settings_t,
    /**
     * Current global settings
     */
    currentGlobalSettings: global_settings_t,
    /**
     * Updates the current settings
     * @param newChatSettings New chat settings
     * @param newGlobalSettings New global settings
     */
    changeSettings: (newChatSettings: chat_settings_t, newGlobalSettings: global_settings_t) => void
}

/**
 * Dialog for settings
 */
export function ChatSettings(props: ChatSettingsProps) {
    const [you, setYou] = useState<string | null>(props.currentChatSettings.you);
    const [lightMode, setLightMode] = useState(props.currentGlobalSettings.lightMode);

    /**
     * Resets the settings
     * @param e Form reset event
     */
    const reset = (e: FormEvent) => {
        e.preventDefault();
        setYou(null);
        setLightMode(!window.matchMedia("(prefers-color-scheme: dark)").matches);
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
            you
        }, { lightMode });
        cancel();
    }

    return <Dialog header="Settings" visible={props.show} onHide={cancel} dismissableMask>
        <form onSubmit={submit} onReset={reset}>
            <h2 className="text-center">Chat settings</h2>
            <div style={{ textAlign: "center", marginTop: "5px" }}>
                <label htmlFor="you" className="right-pad">You:</label>
                <Dropdown value={you} onChange={e => setYou(e.value)} options={Array.from(props.senders)} inputId="you" />
            </div>
            <h2 className="text-center">Global settings</h2>
            <div className="flex-align-center settings-form">
                <span style={{ marginRight: "5px", cursor: "pointer" }} aria-label="Dark mode" onClick={() => setLightMode(false)}>Dark</span>
                <InputSwitch checked={lightMode} onChange={e => setLightMode(e.value)} className="right-pad" />
                <span style={{ cursor: "pointer" }} aria-label="Light mode" onClick={() => setLightMode(true)}>Light</span>
            </div>
            <div className="settings-form2">
                <Button label="Save" icon="pi pi-save" severity="success" type="submit" className="right-pad" />
                <Button label="Reset" icon="pi pi-refresh" severity="warning" type="reset" className="right-pad" />
                <Button label="Cancel" icon="pi pi-times" severity="secondary" outlined type="button" onClick={cancel} />
            </div>
        </form>
    </Dialog>
}

interface GlobalSettingsProps {
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
     * Current settings
     */
    currentSettings: global_settings_t,
    /**
     * Updates the current settings
     * @param newSettings New settings
     */
    changeSettings: (newSettings: global_settings_t) => void
}

/**
 * Dialog for settings
 */
export function GlobalSettings(props: GlobalSettingsProps) {
    const [lightMode, setLightMode] = useState(props.currentSettings.lightMode);

    /**
     * Resets the settings
     * @param e Form reset event
     */
    const reset = (e: FormEvent) => {
        e.preventDefault();
        setLightMode(!window.matchMedia("(prefers-color-scheme: dark)").matches);
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
            lightMode
        });
        cancel();
    }

    return <Dialog header="Settings" visible={props.show} onHide={cancel} dismissableMask>
        <form onSubmit={submit} onReset={reset}>
            <div className="flex-align-center settings-form">
                <span style={{ marginRight: "5px", cursor: "pointer" }} aria-label="Dark mode" onClick={() => setLightMode(false)}>Dark</span>
                <InputSwitch checked={lightMode} onChange={e => setLightMode(e.value)} className="right-pad" />
                <span style={{ cursor: "pointer" }} aria-label="Light mode" onClick={() => setLightMode(true)}>Light</span>
            </div>
            <div className="settings-form2">
                <Button label="Save" icon="pi pi-save" severity="success" type="submit" className="right-pad" />
                <Button label="Reset" icon="pi pi-refresh" severity="warning" type="reset" className="right-pad" />
                <Button label="Cancel" icon="pi pi-times" severity="secondary" outlined type="button" onClick={cancel} />
            </div>
        </form>
    </Dialog>
}