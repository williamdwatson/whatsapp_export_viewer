import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { FormEvent, useState } from "react";
import { settings_t } from "./types";

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

    /**
     * Resets the settings
     * @param e Form reset event
     */
    const reset = (e: FormEvent) => {
        e.preventDefault();
        setYou(null);
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

    return <Dialog header="Settings" visible={props.show} onHide={cancel} dismissableMask>
        <form onSubmit={submit} onReset={reset}>
            <div style={{ textAlign: "center", marginTop: "5px" }}>
                <label htmlFor="you" style={{ marginRight: "5px" }}>You:</label>
                <Dropdown value={you} onChange={e => setYou(e.value)} options={Array.from(props.senders)} inputId="you" />
            </div>
            <div style={{ textAlign: "center", marginTop: "10px" }}>
                <Button label="Save" icon="pi pi-save" severity="success" type="submit" style={{ marginRight: "5px" }} />
                <Button label="Reset" icon="pi pi-refresh" severity="warning" type="reset" style={{ marginRight: "5px" }} />
                <Button label="Cancel" icon="pi pi-times" severity="secondary" outlined type="button" onClick={cancel} />
            </div>
        </form>
    </Dialog>
}