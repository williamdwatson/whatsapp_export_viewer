/**
 * Represents a chat to load
 */
export type chat_files_t = {
    /**
     * Unique chat ID
     */
    id: number,
    /**
     * Chat text file
     */
    chatFile: string,
    /**
     * Optional chat resource directory
     */
    chatDirectory: string | null,
    /**
     * Chat name, if any
     */
    chatName: string,
    /**
     * Whether the chat file is editable
     */
    editable?: boolean
}

/**
 * Represents a media message
 */
export type media_t = {
    /**
     * Media type
     */
    media_type: "PHOTO" | "VIDEO" | "AUDIO" | "OTHER",
    /**
     * Media absolute path, if available
     */
    path: string | null,
    /**
     * Media caption, if any
     */
    caption: string | null
}

/**
 * Text content
 */
export type text_content_t = { Text: string };
/**
 * Media content
 */
export type media_content_t = { Media: media_t };
/**
 * System content
 */
export type system_content_t = { System: string };

/**
 * Represents the content of a message
 */
export type message_content_t = text_content_t | system_content_t | media_content_t

/**
 * Represents a message
 */
export type message_t = {
    /**
     * Index of the message in its chat
     */
    idx: number,
    /**
     * Time of the message
     */
    timestamp: Date,
    /**
     * Who sent the message
     */
    sender: string | null,
    /**
     * Message content
     */
    content: message_content_t,
    /**
     * Whether the chat has been starred
     */
    starred: boolean
}

/**
 * `message_t` with system content
 */
export type system_message_t = Omit<message_t, "content"> & { content: system_content_t };

/**
 * `message_t` with text content
 */
export type text_message_t = Omit<message_t, "content"> & { content: text_content_t };

/**
 * `message_t` with media content
 */
export type media_message_t = Omit<message_t, "content"> & { content: media_content_t };

/**
 * A summary of a WhatsApp chat
 */
export type chat_summary_t = {
    /**
     * Chat name
     */
    name: string,
    /**
     * When the first message was sent; this is only `null` if there are no messages
     */
    first_sent: Date | null,
    /**
     * When the last message was sent; this is only `null` if there are no messages
     */
    last_sent: Date | null,
    /**
     * The last message that was sent; this is only `null` if there are no messages
     */
    last_message: message_t | null,
    /**
     * The total number of messages in the chat
     */
    number_of_messages: number,
    /**
     * Starred messages
     */
    starred: message_t[]
}

/**
 * A message as returned from the "backend"
 */
export type returned_chat_t = Omit<message_t, "timestamp"> & { timestamp: string };

/**
 * Program settings
 */
export type global_settings_t = {
    /**
     * Whether to use light mode
     */
    lightMode: boolean
}

/**
 * Per-chat settings
 */
export type chat_settings_t = {
    /**
     * Who "you" are (for right-aligned messages)
     */
    you: string | null
}

/**
 * Statistics about a chat
 */
export type statistics_t = Record<string, {
    /**
     * Number of sent text messages
     */
    text: number,
    /**
     * Number of sent/associated system messages
     */
    system: number,
    /**
     * Number of sent audio messages
     */
    media: {
        /**
         * Number of sent photos
         */
        photo: number,
        /**
         * Number of sent videos
         */
        video: number,
        /**
         * Number of sent recordings
         */
        audio: number,
        /**
         * Number of sent files/unknown types
         */
        other: number
    }
}>