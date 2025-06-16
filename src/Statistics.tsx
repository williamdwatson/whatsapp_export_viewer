import { Dialog } from "primereact/dialog";
import { statistics_t } from "./types";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";

interface StatisticsProps {
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
     * Statistics to display
     */
    stats: statistics_t,
}

/**
 * Dialog for chat statistics
 */
export default function Statistics(props: StatisticsProps) {

    /**
     * The template for a media sub-stat
     * @param num Number to display
     * @returns `num` formatted for display
     */
    const mediaPartTemplate = (num: number) => {
        return <i>{num}</i>
    }

    // Reformat `props.stats` for use in the `DataTable`
    const vals = Object.entries(props.stats).map(([sender, v]) => {
        return {
            sender,
            text: v.text,
            media: Object.values(v.media).reduce((prev, curr) => prev + curr, 0),
            photo: v.media.photo,
            video: v.media.video,
            audio: v.media.audio,
            other: v.media.other,
            total: v.text + v.system + Object.values(v.media).reduce((prev, curr) => prev + curr, 0)
        }
    });

    return <Dialog header="Statistics" visible={props.show} onHide={() => props.setShow(false)} dismissableMask>
        <DataTable value={vals} scrollable scrollHeight="flex" emptyMessage="No messages">
            <Column header="Who?" field="sender" sortable />
            <Column header="Text" field="text" dataType="numeric" sortable />
            <Column header="Photos" field="photo" dataType="numeric" sortable body={row => mediaPartTemplate(row.photo)} />
            <Column header="Videos" field="video" dataType="numeric" sortable body={row => mediaPartTemplate(row.video)} />
            <Column header="Audio" field="audio" dataType="numeric" sortable body={row => mediaPartTemplate(row.audio)} />
            <Column header="Other files" field="other" dataType="numeric" sortable body={row => mediaPartTemplate(row.other)} />
            <Column header="Media" field="media" dataType="numeric" sortable />
            <Column header="Total" field="total" dataType="numeric" sortable body={row => <b>{row.total}</b>} />
        </DataTable>
    </Dialog>
}