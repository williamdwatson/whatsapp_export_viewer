import { Dialog } from "primereact/dialog";
import { statistics_t } from "./types";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { sum } from "./utilities";

type statistic_row_t = {
    /**
     * Person the stat relates to
     */
    sender: string,
    /**
     * Number of text messages
     */
    text: number,
    /**
     * Total number of media messages (sum of `photo`, `video`, `audio` and `other`) sent
     */
    media: number,
    /**
     * Number of photos sent
     */
    photo: number,
    /**
     * Number of videos sent
     */
    video: number,
    /**
     * Number of audio recordings sent
     */
    audio: number,
    /**
     * Number of other files sent
     */
    other: number,
    /**
     * Total number of messages sent
     */
    total: number
}

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
    const mediaPartTemplate = (num: number, bold: boolean) => {
        return bold ? <b><i>{num}</i></b> : <i>{num}</i>
    }

    // Reformat `props.stats` for use in the `DataTable`
    const total: statistic_row_t = {
        sender: "Total",
        text: 0,
        media: 0,
        photo: 0,
        video: 0,
        audio: 0,
        other: 0,
        total: 0
    };
    const vals: statistic_row_t[] = Object.entries(props.stats).map(([sender, v]) => {
        total.text += v.text;
        total.media += sum(Object.values(v.media));
        total.photo += v.media.photo;
        total.video += v.media.video;
        total.audio += v.media.audio;
        total.other += v.media.other;
        total.total += v.text + v.system + sum(Object.values(v.media));
        return {
            sender,
            text: v.text,
            media: sum(Object.values(v.media)),
            photo: v.media.photo,
            video: v.media.video,
            audio: v.media.audio,
            other: v.media.other,
            total: v.text + v.system + sum(Object.values(v.media))
        }
    });
    vals.push(total);

    return <Dialog header="Statistics" visible={props.show} onHide={() => props.setShow(false)} dismissableMask>
        <DataTable value={vals} scrollable scrollHeight="flex" emptyMessage="No messages">
            <Column header="Who?" field="sender" sortable body={row => row.sender === "Total" ? <b>{row.sender}</b> : row.sender} />
            <Column header="Text" field="text" dataType="numeric" sortable body={row => row.sender === "Total" ? <b>{row.text}</b> : row.text} />
            <Column header="Photos" field="photo" dataType="numeric" sortable body={row => mediaPartTemplate(row.photo, row.sender === "Total")} />
            <Column header="Videos" field="video" dataType="numeric" sortable body={row => mediaPartTemplate(row.video, row.sender === "Total")} />
            <Column header="Audio" field="audio" dataType="numeric" sortable body={row => mediaPartTemplate(row.audio, row.sender === "Total")} />
            <Column header="Unknown files" field="other" dataType="numeric" sortable body={row => mediaPartTemplate(row.other, row.sender === "Total")} />
            <Column header="Media" field="media" dataType="numeric" sortable body={row => row.sender === "Total" ? <b>{row.media}</b> : row.media} />
            <Column header="Total" field="total" dataType="numeric" sortable body={row => <b>{row.total}</b>} />
        </DataTable>
    </Dialog>
}