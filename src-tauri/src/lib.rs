use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::{self, File},
    io::{BufRead, BufReader},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering::Relaxed},
        Arc, Mutex,
    },
};

use chrono::{Duration, NaiveDateTime};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Number of identical messages required to align
const NUMBER_TO_ALIGN: usize = 5;

/// The export version of a WhatsApp chat
enum ExportVersion {
    OLD,
    NEW,
}

/// Common photo extensions
const PHOTO_TYPES: [&'static str; 15] = [
    "png", "apng", "jpg", "jpeg", "gif", "webp", "avif", "jfif", "pjpeg", "pjp", "svg", "bmp",
    "ico", "tif", "tiff",
];

/// Common video extensions
const VIDEO_TYPES: [&'static str; 7] = ["mp4", "avi", "mov", "wmv", "mkv", "webm", "flv"];

/// Common audio extensions
const AUDIO_TYPES: [&'static str; 5] = ["opus", "mp3", "aac", "ogg", "wav"];

/// The type of the media
#[derive(Copy, Clone, PartialEq, Eq, Serialize)]
enum MediaType {
    /// A photo
    PHOTO,
    /// A video
    VIDEO,
    /// An audio file
    AUDIO,
    /// Another file type
    OTHER,
}

/// Represents a media message
#[derive(Clone, Serialize)]
struct Media {
    /// Media type
    media_type: MediaType,
    /// Media path, if available
    path: Option<String>,
    /// Caption, if any
    caption: Option<String>,
}

impl PartialEq for Media {
    /// Checks if two media messages are the same. This is true if
    /// * The `media_type`s are the same
    /// * If both have captions, the captions are the same
    ///
    /// `path` is not checked, since those may belong to different directories.
    fn eq(&self, other: &Self) -> bool {
        if self.media_type != other.media_type {
            return false;
        }
        if self.caption.is_some() && other.caption.is_some() {
            if self.caption != other.caption {
                return false;
            }
        }
        return true;
    }
}
impl Eq for Media {}

/// The content of a WhatsApp message
#[derive(Clone, PartialEq, Eq, Serialize)]
enum MessageContent {
    /// A standard text message
    Text(String),
    /// A media (usually photo or video) message, with path if available
    Media(Media),
    /// A system message (such as changing the group name)
    System(String),
}

impl MessageContent {
    fn is_media(&self) -> bool {
        match self {
            MessageContent::Media(_) => true,
            _ => false,
        }
    }
}

/// A single WhatsApp message
#[derive(Serialize)]
struct Message {
    /// When the message was sent
    timestamp: NaiveDateTime,
    /// Who send the message, if anyone
    sender: Option<String>,
    /// What the message is about
    content: MessageContent,
    /// Whether the message has been starred
    starred: AtomicBool,
    /// Index of the message in its chat, if known
    idx: usize,
}

impl Clone for Message {
    fn clone(&self) -> Message {
        return Message {
            timestamp: self.timestamp.clone(),
            sender: self.sender.clone(),
            content: self.content.clone(),
            starred: AtomicBool::new(self.starred.load(Relaxed)),
            idx: self.idx,
        };
    }
}

impl PartialEq for Message {
    /// Checks if two `Messages` are the same. This is true if
    /// * The senders are the same
    /// * The content is the same (see `eq` on `Media` for details)
    /// * The timestamps are within 12 hours of each other
    fn eq(&self, other: &Message) -> bool {
        let min = self.timestamp.min(other.timestamp);
        let max = self.timestamp.max(other.timestamp);
        if max > min + Duration::hours(12) {
            return false;
        }
        self.sender == other.sender && self.content == other.content
    }
}
impl Eq for Message {}

/// A WhatsApp chat parsed from an export file
#[derive(Clone, Serialize)]
struct WhatsAppChat {
    /// All message of the chat in order
    messages: Vec<Message>,
    /// Resource directories, if available
    directories: Vec<String>,
    /// Chat name
    name: String,
}

/// Summary of a WhatsApp chat
#[derive(Serialize)]
struct ChatSummary {
    /// Chat name
    name: String,
    /// When the first message was sent; this is only `None` if no messages were sent
    first_sent: Option<NaiveDateTime>,
    /// When the last message was sent; this is only `None` if no messages were sent
    last_sent: Option<NaiveDateTime>,
    /// The last message that was sent; this is only `None` if no messages were sent
    last_message: Option<Message>,
    /// The total number of messages
    number_of_messages: usize,
    /// Starred messages
    starred: Vec<Message>,
}

/// Count of each message type
#[derive(Clone, Debug, Serialize)]
struct MessageTypeCount {
    /// Number of text messages
    text: u64,
    /// Number of media messages of each type
    media: MediaTypeCount,
    /// Number of system messages
    system: u64,
}

/// Count of each media type
#[derive(Clone, Default, Debug, Serialize)]
struct MediaTypeCount {
    /// Number of photos
    photo: u64,
    /// Number of videos
    video: u64,
    /// Number of audio files
    audio: u64,
    /// Number of other files
    other: u64,
}

/// A chat from the frontend to load
#[derive(Deserialize)]
#[allow(non_snake_case)]
struct ChatToLoad {
    /// Unique chat ID
    #[allow(dead_code)]
    id: u64,
    /// Chat file path
    chatFile: String,
    /// Chat resource directory path
    chatDirectory: Option<String>,
    /// Chat name
    chatName: String,
}

/// Maintains the app state
struct AppState {
    /// Mapping of chat names to chat objects
    chats: Mutex<Vec<Arc<WhatsAppChat>>>,
}

impl WhatsAppChat {
    /// Gets the number of messages sent by each person in the chat broken down by type
    fn count_by_sender(&self) -> HashMap<String, MessageTypeCount> {
        let mut to_return: HashMap<String, MessageTypeCount> = HashMap::new();
        self.messages.iter().for_each(|m| match &m.sender {
            Some(s) => match to_return.get_mut(s) {
                Some(mtc) => match &m.content {
                    MessageContent::Text(_) => mtc.text += 1,
                    MessageContent::System(_) => mtc.system += 1,
                    MessageContent::Media(mm) => match mm.media_type {
                        MediaType::PHOTO => mtc.media.photo += 1,
                        MediaType::VIDEO => mtc.media.video += 1,
                        MediaType::AUDIO => mtc.media.audio += 1,
                        MediaType::OTHER => mtc.media.other += 1,
                    },
                },
                None => {
                    match &m.content {
                        MessageContent::Text(_) => {
                            to_return.insert(
                                s.clone(),
                                MessageTypeCount {
                                    text: 1,
                                    media: MediaTypeCount::default(),
                                    system: 0,
                                },
                            );
                        }
                        MessageContent::System(_) => {
                            to_return.insert(
                                s.clone(),
                                MessageTypeCount {
                                    text: 0,
                                    media: MediaTypeCount::default(),
                                    system: 1,
                                },
                            );
                        }
                        MessageContent::Media(mm) => {
                            let media_type_count = match mm.media_type {
                                MediaType::PHOTO => MediaTypeCount {
                                    photo: 1,
                                    video: 0,
                                    audio: 0,
                                    other: 0,
                                },
                                MediaType::VIDEO => MediaTypeCount {
                                    photo: 0,
                                    video: 1,
                                    audio: 0,
                                    other: 0,
                                },
                                MediaType::AUDIO => MediaTypeCount {
                                    photo: 0,
                                    video: 0,
                                    audio: 1,
                                    other: 0,
                                },
                                MediaType::OTHER => MediaTypeCount {
                                    photo: 0,
                                    video: 0,
                                    audio: 0,
                                    other: 1,
                                },
                            };
                            to_return.insert(
                                s.clone(),
                                MessageTypeCount {
                                    text: 0,
                                    media: media_type_count,
                                    system: 0,
                                },
                            );
                        }
                    };
                }
            },
            _ => {}
        });
        return to_return;
    }
}

/// Searches the messages in `chat` for the given string
/// # Args
/// * `chat` - Name of the chat to search
/// * `search` - String to search
#[tauri::command]
fn search(chat: String, search: String, state: State<'_, AppState>) -> Result<Vec<usize>, String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    let lower_search = search.to_lowercase();
    for c in locked_chats.iter() {
        if c.name == chat {
            return Ok(c
                .messages
                .iter()
                .filter(|m| match &m.content {
                    MessageContent::Text(text) => text.to_lowercase().contains(&lower_search),
                    MessageContent::Media(media) => match &media.caption {
                        Some(caption) => caption.to_lowercase().contains(&lower_search),
                        _ => false,
                    },
                    MessageContent::System(system) => system.to_lowercase().contains(&lower_search),
                })
                .map(|m| m.idx)
                .collect());
        }
    }
    return Err("Failed to find chat".to_owned());
}

/// Stars or unstars the specified message
/// # Args
/// * `chat` - Name of the chat of interest
/// * `messageIdx` - Index of the message of interest
#[tauri::command]
#[allow(non_snake_case)]
fn star_message(chat: String, messageIdx: usize, state: State<'_, AppState>) -> Result<(), String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    for c in locked_chats.iter() {
        if c.name == chat {
            if messageIdx >= c.messages.len() {
                return Err("No message exists at that index".to_owned());
            }
            c.messages[messageIdx].starred.fetch_not(Relaxed);
            return Ok(());
        }
    }
    return Err("Failed to find chat".to_owned());
}

/// Gets the starred messages for the specified `chat`
/// # Args
/// * `chat` - Name of the chat
#[tauri::command]
fn get_starred(chat: String, state: State<'_, AppState>) -> Result<Vec<Message>, String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    for c in locked_chats.iter() {
        if c.name == chat {
            return Ok(c
                .messages
                .iter()
                .filter(|m| m.starred.load(Relaxed))
                .map(|m| m.clone())
                .collect());
        }
    }
    return Err("Failed to find chat".to_owned());
}

/// Gets chat statistics
#[tauri::command]
fn get_stats(
    chat: String,
    state: State<'_, AppState>,
) -> Result<HashMap<String, MessageTypeCount>, String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    for c in locked_chats.iter() {
        if c.name == chat {
            return Ok(c.count_by_sender());
        }
    }
    return Err("Failed to find chat".to_owned());
}

/// Searches `directory` for a file named `path`; if one is found, the full string path
fn full_file_path(
    path: &str,
    directory: &Option<String>,
    directory_files: &HashSet<String>,
) -> Option<String> {
    match directory {
        Some(dir) if directory_files.contains(path) => {
            Some(Path::new(dir).join(path).to_string_lossy().into_owned())
        }
        _ => None,
    }
}

/// Parses a WhatsApp chat export
/// # Parameters
/// * `path` - Path to the chat file
fn parse_whatsapp_export(
    path: &str,
    directory: &Option<String>,
    name: &str,
) -> Result<WhatsAppChat, String> {
    let file = File::open(path).or(Err("Error opening file"))?;
    let reader: BufReader<File> = BufReader::new(file);
    let mut first = true;
    let mut version = ExportVersion::NEW;
    let mut messages: Vec<Message> = Vec::new();
    let mut senders: HashSet<String> = HashSet::with_capacity(2);
    let mut directory_files = HashSet::new();
    match directory {
        Some(dir) => match fs::read_dir(dir) {
            Ok(paths) => {
                paths.for_each(|p| match p {
                    Ok(dir_entry) => {
                        let dir_entry_path = dir_entry.path();
                        if dir_entry_path.is_file() {
                            match dir_entry_path.file_name() {
                                Some(file_name) => {
                                    directory_files
                                        .insert(file_name.to_string_lossy().into_owned());
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                });
            }
            _ => {}
        },
        _ => {}
    }
    for line in reader.lines() {
        match line {
            Ok(l) => {
                let l = l.trim().replace('\u{200e}', "");
                if l.trim().len() == 0 {
                    continue;
                }
                if first {
                    if l.chars().next().unwrap() == '[' {
                        version = ExportVersion::OLD;
                    }
                    first = false;
                }
                match version {
                    ExportVersion::OLD => {
                        // If the message doesn't start with a open square bracket, it's a continuation of the previous message
                        if !l.starts_with('[') {
                            if let Some(last_idx) = messages.len().checked_sub(1) {
                                let last_msg = &messages[last_idx];
                                if let MessageContent::Text(last_msg_content) = &last_msg.content {
                                    messages[last_idx] = Message {
                                        timestamp: last_msg.timestamp,
                                        sender: last_msg.sender.clone(),
                                        content: MessageContent::Text(
                                            last_msg_content.to_owned() + "\n" + &l,
                                        ),
                                        starred: AtomicBool::new(false),
                                        idx: last_msg.idx,
                                    };
                                }
                            }
                        }
                        // Otherwise it's the start of a normal message
                        else {
                            // Get the end time
                            let time_end_idx = l.find("] ").ok_or("Failed to find time end")?;
                            let timestamp = NaiveDateTime::parse_from_str(
                                &l[1..time_end_idx],
                                "%m/%d/%y, %I:%M:%S %p",
                            )
                            .or(Err("Failed to parse time"))?;
                            if let Some(col_i) = l[time_end_idx + 2..].find(": ") {
                                let colon_idx = col_i + time_end_idx + 2;
                                let sender = l[time_end_idx + 2..colon_idx].to_string();
                                senders.insert(sender.clone());
                                if l.contains("<attached: ") {
                                    let attached_idx = l.find("<attached: ").unwrap();
                                    let file_name = &l[attached_idx + 11..l.len() - 1];
                                    let media_type = if PHOTO_TYPES
                                        .iter()
                                        .any(|ext| file_name.ends_with(ext))
                                    {
                                        MediaType::PHOTO
                                    } else if VIDEO_TYPES.iter().any(|ext| file_name.ends_with(ext))
                                    {
                                        MediaType::VIDEO
                                    } else if AUDIO_TYPES.iter().any(|ext| file_name.ends_with(ext))
                                    {
                                        MediaType::AUDIO
                                    } else {
                                        MediaType::OTHER
                                    };
                                    messages.push(Message {
                                        timestamp,
                                        sender: Some(sender),
                                        content: MessageContent::Media(Media {
                                            media_type,
                                            path: full_file_path(
                                                file_name,
                                                directory,
                                                &directory_files,
                                            ),
                                            caption: None,
                                        }),
                                        starred: AtomicBool::new(false),
                                        idx: messages.len(),
                                    });
                                } else {
                                    messages.push(Message {
                                        timestamp,
                                        sender: Some(sender),
                                        content: MessageContent::Text(
                                            l[colon_idx + 2..].to_string(),
                                        ),
                                        starred: AtomicBool::new(false),
                                        idx: messages.len(),
                                    })
                                }
                            }
                            // Handle "system" messages
                            else {
                                // They probably start with a previous user's name
                                let mut sender = None;
                                for s in senders.iter() {
                                    if l[time_end_idx + 2..].starts_with(s) {
                                        sender = Some(s.to_owned());
                                    }
                                }
                                messages.push(Message {
                                    timestamp,
                                    sender,
                                    content: MessageContent::System(
                                        l[time_end_idx + 2..].to_string(),
                                    ),
                                    starred: AtomicBool::new(false),
                                    idx: messages.len(),
                                })
                            }
                        }
                    }
                    ExportVersion::NEW => {
                        // Find the index of (A/P)M - <name>
                        if let Some(dash_idx) = l.find("M - ") {
                            if dash_idx <= 19 {
                                let timestamp = NaiveDateTime::parse_from_str(
                                    &l[..dash_idx + 1],
                                    "%m/%d/%y, %I:%M %p",
                                )
                                .or(Err("Failed to parse time"))?;
                                if let Some(col_i) = l[dash_idx + 4..].find(": ") {
                                    let colon_idx = col_i + dash_idx + 4;
                                    let sender = l[dash_idx + 4..colon_idx].to_string();
                                    senders.insert(sender.clone());
                                    if l.contains("<Media omitted>") {
                                        messages.push(Message {
                                            timestamp,
                                            sender: Some(sender),
                                            content: MessageContent::Media(Media {
                                                media_type: MediaType::OTHER,
                                                path: None,
                                                caption: None,
                                            }),
                                            starred: AtomicBool::new(false),
                                            idx: messages.len(),
                                        })
                                    } else if l.ends_with("(file attached)") {
                                        let file_name = &l[colon_idx + 2..l.len() - 16];
                                        let media_type = if PHOTO_TYPES
                                            .iter()
                                            .any(|ext| file_name.ends_with(ext))
                                        {
                                            MediaType::PHOTO
                                        } else if VIDEO_TYPES
                                            .iter()
                                            .any(|ext| file_name.ends_with(ext))
                                        {
                                            MediaType::VIDEO
                                        } else if AUDIO_TYPES
                                            .iter()
                                            .any(|ext| file_name.ends_with(ext))
                                        {
                                            MediaType::AUDIO
                                        } else {
                                            MediaType::OTHER
                                        };
                                        messages.push(Message {
                                            timestamp,
                                            sender: Some(sender),
                                            content: MessageContent::Media(Media {
                                                media_type,
                                                path: full_file_path(
                                                    file_name,
                                                    directory,
                                                    &directory_files,
                                                ),
                                                caption: None,
                                            }),
                                            starred: AtomicBool::new(false),
                                            idx: messages.len(),
                                        });
                                    } else if l[colon_idx + 2..].to_string().trim() != "null" {
                                        messages.push(Message {
                                            timestamp,
                                            sender: Some(sender),
                                            content: MessageContent::Text(
                                                l[colon_idx + 2..].to_string(),
                                            ),
                                            starred: AtomicBool::new(false),
                                            idx: messages.len(),
                                        })
                                    }
                                }
                                // Handle "system" messages
                                else {
                                    // They probably start with a previous user's name
                                    let mut sender = None;
                                    for s in senders.iter() {
                                        if l[dash_idx + 4..].starts_with(s) {
                                            sender = Some(s.to_owned());
                                        }
                                    }
                                    messages.push(Message {
                                        timestamp,
                                        sender,
                                        content: MessageContent::System(
                                            l[dash_idx + 4..].to_string(),
                                        ),
                                        starred: AtomicBool::new(false),
                                        idx: messages.len(),
                                    })
                                }
                            }
                            // If the dash is not in the first 19 characters, it's not part of the message time
                            else if let Some(last_idx) = messages.len().checked_sub(1) {
                                let last_msg = &messages[last_idx];
                                if let MessageContent::Text(last_msg_content) = &last_msg.content {
                                    messages[last_idx] = Message {
                                        timestamp: last_msg.timestamp,
                                        sender: last_msg.sender.clone(),
                                        content: MessageContent::Text(
                                            last_msg_content.to_owned() + "\n" + &l,
                                        ),
                                        starred: AtomicBool::new(false),
                                        idx: last_msg.idx,
                                    };
                                }
                            }
                        }
                        // If there is no match, it's probably a continuation of the previous message
                        else if let Some(last_idx) = messages.len().checked_sub(1) {
                            let last_msg = &messages[last_idx];
                            if let MessageContent::Text(last_msg_content) = &last_msg.content {
                                messages[last_idx] = Message {
                                    timestamp: last_msg.timestamp,
                                    sender: last_msg.sender.clone(),
                                    content: MessageContent::Text(
                                        last_msg_content.to_owned() + "\n" + &l,
                                    ),
                                    starred: AtomicBool::new(false),
                                    idx: last_msg.idx,
                                };
                            } else if let MessageContent::Media(last_msg_content) =
                                &last_msg.content
                            {
                                messages[last_idx] = Message {
                                    timestamp: last_msg.timestamp,
                                    sender: last_msg.sender.clone(),
                                    content: MessageContent::Media(Media {
                                        media_type: last_msg_content.media_type,
                                        path: last_msg_content.path.clone(),
                                        caption: match &last_msg_content.caption {
                                            Some(old_caption) => {
                                                Some(old_caption.to_owned() + "\n" + &l)
                                            }
                                            None => Some(l),
                                        },
                                    }),
                                    starred: AtomicBool::new(false),
                                    idx: last_msg.idx,
                                }
                            }
                        }
                    }
                }
            }
            Err(_) => {}
        }
    }
    for i in 0..messages.len() {
        let message = messages[i].clone();
        match &message.content {
            MessageContent::System(content) => {
                if message.sender.is_none() {
                    for s in senders.iter() {
                        if content.starts_with(s) {
                            messages[i] = Message {
                                timestamp: message.timestamp,
                                sender: Some(s.to_owned()),
                                content: message.content.clone(),
                                starred: AtomicBool::new(false),
                                idx: message.idx,
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    Ok(WhatsAppChat {
        messages,
        directories: match directory {
            Some(d) => vec![d.clone()],
            None => Vec::new(),
        },
        name: name.to_owned(),
    })
}

fn find_first_overlap_idx(
    combined_messages: &VecDeque<Message>,
    new_messages: &Vec<Message>,
) -> Option<(usize, usize)> {
    let mut start_overlap_idx = 0;
    let mut start_overlap_idx_combined = 0;
    let mut num_overlap = 0usize;
    let mut non_media_overlap = false;
    for (i, m) in new_messages.iter().enumerate() {
        for (j, mm) in combined_messages.iter().enumerate() {
            if num_overlap == 0 && m == mm {
                start_overlap_idx = i;
                start_overlap_idx_combined = j;
                num_overlap = 1;
                non_media_overlap = m.content.is_media()
            } else if num_overlap > 0 && m != mm {
                num_overlap = 0;
                non_media_overlap = false;
            } else if m == mm {
                num_overlap += 1;
                non_media_overlap |= m.content.is_media();
                if num_overlap > NUMBER_TO_ALIGN && non_media_overlap {
                    return Some((start_overlap_idx, start_overlap_idx_combined));
                }
            }
        }
    }
    None
}

/// Combines the WhatsApp `chats`. Messages with identical content are combined within a +/- 12 hour window.
/// Messages from earlier entries in `chats` are prioritized over those of later entries.
/// The chats may have overlap, and overlapping entries will be deduplicated,
/// but interleaved messages may not be included in the result. The chat name will be taken from the first chat.
/// # Parameters
/// * `chats` - Chats to combine
fn combine_chats(mut chats: Vec<WhatsAppChat>) -> WhatsAppChat {
    if chats.is_empty() {
        return WhatsAppChat {
            messages: Vec::new(),
            directories: Vec::new(),
            name: "".to_owned(),
        };
    }
    let name = chats[0].name.clone();
    let mut all_chat_messages: Vec<&Vec<Message>> = Vec::new();
    let mut all_chat_timestamps: Vec<Vec<NaiveDateTime>> = Vec::new();
    let mut max_len = 0;
    let mut directories = Vec::new();
    for c in chats.iter_mut() {
        if c.messages.len() > max_len {
            max_len = c.messages.len();
        }
        c.messages.sort_by_key(|m| m.timestamp);
        all_chat_timestamps.push(c.messages.iter().map(|mm| mm.timestamp).collect());
        all_chat_messages.push(&c.messages);
        // Using a vec instead of a set to ensure
        for d in c.directories.iter() {
            if !directories.contains(d) {
                directories.push(d.clone());
            }
        }
    }
    let mut combined_chat: VecDeque<Message> = VecDeque::with_capacity(max_len);
    let mut max_timestamp: Option<NaiveDateTime> = None;
    let mut min_timestamp: Option<NaiveDateTime> = None;
    for (messages, timestamps) in all_chat_messages.into_iter().zip(all_chat_timestamps) {
        if messages.is_empty() {
            continue;
        }
        match (min_timestamp, max_timestamp) {
            // If there is currently no min/max time, this is the first set of messages
            (None, None) => {
                max_timestamp = Some(messages.iter().map(|m| m.timestamp).max().unwrap());
                min_timestamp = Some(messages.iter().map(|m| m.timestamp).min().unwrap());
                for m in messages {
                    combined_chat.push_back(m.clone());
                }
            }
            // Otherwise try to combine
            (Some(min_t), Some(max_t)) => {
                // Find where the messages start overlapping
                match find_first_overlap_idx(&combined_chat, &messages) {
                    Some((start_overlap_idx_new, start_overlap_idx_combined)) => {
                        // Add messages before the start of the overlap index to the front of combined
                        for i in (0..start_overlap_idx_new).rev() {
                            if i == 0 {
                                min_timestamp = Some(messages[i].timestamp);
                            }
                            combined_chat.push_front(messages[i].clone());
                        }
                        // Then loop through the overlapping region
                        let mut last_done_idx = start_overlap_idx_new;
                        for (i, m) in messages[start_overlap_idx_new..].iter().enumerate() {
                            let idx_in_combined =
                                i + start_overlap_idx_new + start_overlap_idx_combined;
                            if idx_in_combined > combined_chat.len()
                                || m != &combined_chat[idx_in_combined]
                            {
                                break;
                            }
                            match &m.content {
                                MessageContent::Media(media) => {
                                    match &mut combined_chat[idx_in_combined].content {
                                        MessageContent::Media(present_content) => {
                                            if present_content.path.is_none()
                                                && media.path.is_some()
                                            {
                                                present_content.path = media.path.clone();
                                            }
                                            if present_content.caption.is_none()
                                                && media.caption.is_some()
                                            {
                                                present_content.caption = media.caption.clone();
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                                _ => {}
                            }
                            last_done_idx += 1;
                        }
                        // Add messages that were past the overlapping region
                        for m in &messages[last_done_idx..] {
                            combined_chat.push_back(m.clone());
                        }
                        max_timestamp =
                            Some(combined_chat.iter().map(|c| c.timestamp).max().unwrap());
                    }
                    None => {
                        // If every new message is older, then just add them to the front
                        if timestamps.iter().max().unwrap() < &min_t {
                            for m in messages.iter().rev() {
                                combined_chat.push_front(m.clone());
                            }
                            min_timestamp = Some(*timestamps.iter().min().unwrap());
                        }
                        // If every new message is newer, then just add them to the back
                        else if timestamps.iter().min().unwrap() > &max_t {
                            for m in messages {
                                combined_chat.push_back(m.clone());
                            }
                            max_timestamp = Some(*timestamps.iter().max().unwrap());
                        }
                    }
                }
            }
            _ => unreachable!(),
        }
    }
    return WhatsAppChat {
        messages: combined_chat
            .into_iter()
            .enumerate()
            .map(|(idx, m)| Message {
                timestamp: m.timestamp,
                sender: m.sender,
                content: m.content,
                starred: m.starred,
                idx,
            })
            .collect(),
        directories,
        name,
    };
}

#[tauri::command]
fn get_chat(chat: String, state: State<'_, AppState>) -> Result<Arc<WhatsAppChat>, String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;

    match locked_chats.iter().find(|c| c.name == chat) {
        Some(c) => {
            return Ok(Arc::clone(c));
        }
        None => {
            return Err("Failed to find chat".to_owned());
        }
    }
}

/// Loads chats from the frontend
#[tauri::command]
fn load_chats(
    chats: Vec<ChatToLoad>,
    state: State<'_, AppState>,
) -> Result<Vec<ChatSummary>, String> {
    let mut grouped_by_name: HashMap<String, Vec<ChatToLoad>> = HashMap::new();
    let mut chat_summaries = Vec::new();
    chats.into_iter().for_each(|c| {
        if grouped_by_name.contains_key(&c.chatName) {
            grouped_by_name.get_mut(&c.chatName).unwrap().push(c);
        } else {
            grouped_by_name.insert(c.chatName.clone(), vec![c]);
        }
    });
    let mut chats = Vec::with_capacity(grouped_by_name.len());
    for (k, v) in grouped_by_name {
        let mut parsed = Vec::with_capacity(v.len());
        for c in v {
            let p = parse_whatsapp_export(&c.chatFile, &c.chatDirectory, &k)?;
            parsed.push(p);
        }
        let combined = combine_chats(parsed);
        chat_summaries.push(ChatSummary {
            name: k.clone(),
            first_sent: combined.messages.iter().map(|c| c.timestamp).min(),
            last_sent: combined.messages.iter().map(|c| c.timestamp).max(),
            last_message: combined.messages.last().cloned(),
            number_of_messages: combined.messages.len(),
            starred: Vec::new(),
        });
        chats.push(Arc::new(combined));
    }
    let mut to_change = state.chats.lock().or(Err("Failed to get lock on state"))?;
    *to_change = chats;
    return Ok(chat_summaries);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            chats: Vec::new().into(),
        })
        .invoke_handler(tauri::generate_handler![
            load_chats,
            get_chat,
            search,
            star_message,
            get_starred,
            get_stats
        ])
        .run(tauri::generate_context!())
        .expect("Error while running application");
}
