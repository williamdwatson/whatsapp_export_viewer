use std::{
    collections::{HashMap, HashSet},
    fs::{self, create_dir_all, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering::Relaxed},
        Arc, Mutex,
    },
};

use chrono::{Duration, NaiveDateTime};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

/// App theme
#[derive(Serialize, Deserialize, Copy, Clone)]
enum Theme {
    /// Light theme
    LIGHT,
    /// Dark theme
    DARK,
    /// Unspecified theme
    UNSPECIFIED,
}

/// The export version of a WhatsApp chat
enum ExportVersion {
    OLD,
    NEW,
}

/// Common photo extensions
const PHOTO_TYPES: [&str; 15] = [
    "png", "apng", "jpg", "jpeg", "gif", "webp", "avif", "jfif", "pjpeg", "pjp", "svg", "bmp",
    "ico", "tif", "tiff",
];

/// Common video extensions
const VIDEO_TYPES: [&str; 7] = ["mp4", "avi", "mov", "wmv", "mkv", "webm", "flv"];

/// Common audio extensions
const AUDIO_TYPES: [&str; 5] = ["opus", "mp3", "aac", "ogg", "wav"];

/// Extension to use for the cached chats
const SAVE_NAME: &str = "chat_data.json";

/// The type of the media
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize)]
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
#[derive(Clone, Debug, Serialize)]
struct Media {
    /// Media type
    media_type: MediaType,
    /// Media path, if available
    path: Option<String>,
    /// Caption, if any
    caption: Option<String>,
}

impl PartialEq for Media {
    /// Checks if two media messages are the same. This is false if
    /// * Both have captions but the captions are not the same
    /// * Both have paths but their media types are not the same
    /// Otherwise, it returns true
    ///
    /// `path` is not checked, since those may belong to different directories.
    fn eq(&self, other: &Self) -> bool {
        if self.caption.is_some() && other.caption.is_some() {
            if self.caption != other.caption {
                return false;
            }
        }
        if self.path.is_none() || other.path.is_none() {
            return true;
        }
        return self.media_type == other.media_type;
    }
}
impl Eq for Media {}

/// The content of a WhatsApp message
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
enum MessageContent {
    /// A standard text message
    Text(String),
    /// A media (usually photo or video) message, with path if available
    Media(Media),
    /// A system message (such as changing the group name)
    System(String),
}

/// A single WhatsApp message
#[derive(Debug, Serialize)]
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
    /// Unique identifier of the chat
    id: Uuid,
    /// All message of the chat in order
    messages: Vec<Message>,
    /// Chat file
    file: String,
    /// Resource directories, if available
    directories: Vec<String>,
    /// Chat name
    name: String,
    /// Which message sender is considered to be "you"
    you: Arc<Mutex<Option<String>>>,
}

/// Basic information about a chat
#[derive(Serialize, Deserialize)]
struct SavedChats {
    /// Program theme
    theme: Theme,
    /// Saved chats
    chats: Vec<BasicChatDataWithStars>,
}

/// Basic information chat a chat, including starred messages
#[derive(Serialize, Deserialize)]
struct BasicChatDataWithStars {
    /// UUIID of the chat
    id: Uuid,
    /// Path of the chat file
    file: String,
    /// Directory of the chat's files, if any
    directory: Option<String>,
    /// Chat name
    name: String,
    /// Starred message indices
    starred: Vec<usize>,
    /// Sender to mark as "you"
    you: Option<String>,
}

/// Summary of a WhatsApp chat
#[derive(Serialize)]
struct ChatSummary {
    /// Warnings when the chat was loaded
    warnings: Vec<String>,
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
    /// Which sender is considered "you"
    you: Option<String>,
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
    id: Uuid,
    /// Chat file path
    file: String,
    /// Chat resource directory path
    directory: Option<String>,
    /// Chat name
    name: String,
    /// Indices of the starred messages
    starred: Vec<usize>,
    /// Which sender is "you"
    you: Option<String>,
}

struct ParsedWhatsAppChat {
    /// Warning messages during loading
    warnings: Vec<String>,
    /// Parsed chat
    chat: WhatsAppChat,
}

/// Maintains the app state
struct AppState {
    /// Mapping of chat names to chat objects
    chats: Mutex<Vec<Arc<WhatsAppChat>>>,
    /// App theme
    theme: Mutex<Theme>,
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

/// Saves basic information about the specified chats
/// # Parameters
/// * `directory` - Directory to which the chat information should be saved
/// * `chats` - Chats to save
fn save_basic_chat_data(
    directory: &PathBuf,
    chats: &Vec<Arc<WhatsAppChat>>,
    theme: Theme,
) -> Result<(), String> {
    create_dir_all(directory).map_err(|err| err.to_string())?;
    let mut basic_data = Vec::with_capacity(chats.len());
    for c in chats {
        let you = c
            .you
            .lock()
            .or(Err("Failed to get lock on state".to_owned()))?
            .clone();
        basic_data.push(BasicChatDataWithStars {
            id: c.id,
            file: c.file.clone(),
            directory: c.directories.first().cloned(),
            name: c.name.clone(),
            starred: c
                .messages
                .iter()
                .enumerate()
                .filter_map(|(idx, m)| {
                    if m.starred.load(Relaxed) {
                        Some(idx)
                    } else {
                        None
                    }
                })
                .collect(),
            you,
        });
    }
    let f = fs::File::create(directory.join(SAVE_NAME)).map_err(|e| e.to_string())?;
    serde_json::to_writer(
        f,
        &SavedChats {
            theme,
            chats: basic_data,
        },
    )
    .map_err(|e| e.to_string())
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
fn star_message(
    chat: String,
    messageIdx: usize,
    state: State<'_, AppState>,
    handle: AppHandle,
) -> Result<(), String> {
    let locked_chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    let theme = state
        .theme
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    for c in locked_chats.iter() {
        if c.name == chat {
            if messageIdx >= c.messages.len() {
                return Err("No message exists at that index".to_owned());
            }
            c.messages[messageIdx].starred.fetch_not(Relaxed);
            let app_data_dir = handle
                .path()
                .app_local_data_dir()
                .map_err(|err| err.to_string())?;
            let _ = save_basic_chat_data(&app_data_dir, &locked_chats, *theme);
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
    Err("Failed to find chat".to_owned())
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
    id: &Uuid,
    starred: &Vec<usize>,
    you: &Option<String>,
) -> Result<ParsedWhatsAppChat, String> {
    let file = File::open(path).or(Err("Error opening file"))?;
    let reader: BufReader<File> = BufReader::new(file);
    let mut first = true;
    let mut version = ExportVersion::NEW;
    let mut messages: Vec<Message> = Vec::new();
    let mut senders: HashSet<String> = HashSet::with_capacity(2);
    let mut directory_files = HashSet::new();
    let mut warnings = Vec::new();
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
                    if l.chars().next().unwrap_or(' ') == '[' {
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
                            .or(Err(format!(
                                "Failed to parse time: {0}",
                                &l[1..time_end_idx]
                            )))?;
                            if let Some(col_i) = l[time_end_idx + 2..].find(": ") {
                                let colon_idx = col_i + time_end_idx + 2;
                                let sender = l[time_end_idx + 2..colon_idx].to_string();
                                senders.insert(sender.clone());
                                if l.contains("<attached: ") {
                                    let attached_idx = l.find("<attached: ").unwrap();
                                    let file_name = &l[attached_idx + 11..l.len() - 1];
                                    let media_type = if PHOTO_TYPES
                                        .iter()
                                        .any(|ext| file_name.to_lowercase().ends_with(ext))
                                    {
                                        MediaType::PHOTO
                                    } else if VIDEO_TYPES
                                        .iter()
                                        .any(|ext| file_name.to_lowercase().ends_with(ext))
                                    {
                                        MediaType::VIDEO
                                    } else if AUDIO_TYPES
                                        .iter()
                                        .any(|ext| file_name.to_lowercase().ends_with(ext))
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
                                    });
                                }
                            }
                            // Handle "system" messages
                            else {
                                // Icon messages aren't included in the "new" exports, which can hinder matching them up
                                if !l[time_end_idx + 2..].ends_with("icon") {
                                    // They probably start with a previous user's name
                                    let mut sender = None;
                                    for s in senders.iter() {
                                        if l[time_end_idx + 2..].starts_with(s) {
                                            sender = Some(s.to_owned());
                                            break;
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
                                    });
                                }
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
                                .or(Err(format!(
                                    "Failed to parse time: {0}",
                                    &l[..dash_idx + 1]
                                )))?;
                                if let Some(col_i) = l[dash_idx + 4..].find(": ") {
                                    let colon_idx = col_i + dash_idx + 4;
                                    let sender = l[dash_idx + 4..colon_idx].to_string();
                                    senders.insert(sender.clone());
                                    if l.contains("<Media omitted") {
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
                                        });
                                    } else if l.ends_with("(file attached)") {
                                        let file_name = &l[colon_idx + 2..l.len() - 16];
                                        let media_type = if PHOTO_TYPES
                                            .iter()
                                            .any(|ext| file_name.to_lowercase().ends_with(ext))
                                        {
                                            MediaType::PHOTO
                                        } else if VIDEO_TYPES
                                            .iter()
                                            .any(|ext| file_name.to_lowercase().ends_with(ext))
                                        {
                                            MediaType::VIDEO
                                        } else if AUDIO_TYPES
                                            .iter()
                                            .any(|ext| file_name.to_lowercase().ends_with(ext))
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
                                        });
                                    }
                                }
                                // Handle "system" messages
                                else {
                                    // They probably start with a previous user's name
                                    let mut sender = None;
                                    for s in senders.iter() {
                                        if l[dash_idx + 4..].starts_with(s) {
                                            sender = Some(s.to_owned());
                                            break;
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
                                    });
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
    let mut new_messages = HashMap::new();
    for i in 0..messages.len() {
        match &messages[i].content {
            MessageContent::System(content) => {
                if messages[i].sender.is_none() {
                    for s in senders.iter() {
                        if content.starts_with(s) {
                            new_messages.insert(
                                i,
                                Message {
                                    timestamp: messages[i].timestamp,
                                    sender: Some(s.to_owned()),
                                    content: messages[i].content.clone(),
                                    starred: AtomicBool::new(false),
                                    idx: messages[i].idx,
                                },
                            );
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }
    for (idx, new_messages) in new_messages {
        messages[idx] = new_messages;
    }
    messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    for idx in starred {
        if let Some(m) = messages.get(*idx) {
            m.starred.store(true, Relaxed);
        } else {
            warnings.push(
                "Some starred indices not found; these messages have not been stared.".to_owned(),
            );
        }
    }
    Ok(ParsedWhatsAppChat {
        warnings,
        chat: WhatsAppChat {
            id: *id,
            messages,
            file: path.to_owned(),
            directories: match directory {
                Some(d) => vec![d.clone()],
                None => Vec::new(),
            },
            name: name.to_owned(),
            you: Arc::new(Mutex::new(you.clone())),
        },
    })
}

/// Gets information about the saved chats
#[tauri::command]
fn get_saved_chats(handle: AppHandle) -> Result<SavedChats, String> {
    let app_data_dir = handle
        .path()
        .app_local_data_dir()
        .map_err(|err| err.to_string())?;
    let data = fs::read_to_string(app_data_dir.join(SAVE_NAME)).map_err(|e| e.to_string())?;
    let data = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(data)
}

/// Removes the specified chat
/// # Parameters
/// * `chat` - Name of the chat to remove
#[tauri::command]
fn remove_chat(chat: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut to_change = state.chats.lock().or(Err("Failed to get lock on state"))?;
    *to_change = to_change
        .iter()
        .filter_map(|c| {
            if c.name == chat {
                Some(Arc::clone(c))
            } else {
                None
            }
        })
        .collect();
    Ok(())
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
    handle: AppHandle,
) -> Result<Vec<ChatSummary>, String> {
    let mut names = HashSet::with_capacity(chats.len());
    for c in chats.iter() {
        if !names.insert(&c.name) {
            return Err(format!("Chat name {0} used more than once", c.name));
        }
    }
    let mut to_change = state.chats.lock().or(Err("Failed to get lock on state"))?;
    let mut chat_summaries = Vec::new();
    let mut parsed_chats = Vec::with_capacity(chats.len());
    for c in chats {
        if let Some(matching) = to_change.iter().find(|cc| cc.id == c.id) {
            let you = matching.you.lock().or(Err("Failed to get lock on you"))?;
            parsed_chats.push(Arc::clone(matching));
            chat_summaries.push(ChatSummary {
                warnings: Vec::new(),
                name: c.name,
                first_sent: matching.messages.iter().map(|m| m.timestamp).min(),
                last_sent: matching.messages.iter().map(|m| m.timestamp).max(),
                last_message: matching.messages.last().cloned(),
                number_of_messages: matching.messages.len(),
                starred: matching
                    .messages
                    .iter()
                    .filter_map(|m| {
                        if m.starred.load(Relaxed) {
                            Some(m.clone())
                        } else {
                            None
                        }
                    })
                    .collect(),
                you: you.clone(),
            });
        } else {
            let p =
                parse_whatsapp_export(&c.file, &c.directory, &c.name, &c.id, &c.starred, &c.you)?;
            chat_summaries.push(ChatSummary {
                warnings: p.warnings,
                name: c.name,
                first_sent: p.chat.messages.iter().map(|m| m.timestamp).min(),
                last_sent: p.chat.messages.iter().map(|m| m.timestamp).max(),
                last_message: p.chat.messages.last().cloned(),
                number_of_messages: p.chat.messages.len(),
                starred: Vec::new(),
                you: c.you,
            });
            parsed_chats.push(Arc::new(p.chat));
        }
    }
    let app_data_dir = handle
        .path()
        .app_local_data_dir()
        .map_err(|err| err.to_string())?;
    let theme = state
        .theme
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    let _ = save_basic_chat_data(&app_data_dir, &parsed_chats, *theme);
    *to_change = parsed_chats;
    return Ok(chat_summaries);
}

/// Sets the "you" of the specified chat
/// # Parameters
/// * `chat` - Name of the chat
/// * `you` - Name of the sender, if any
#[tauri::command]
fn set_you(
    chat: String,
    you: Option<String>,
    state: State<'_, AppState>,
    handle: AppHandle,
) -> Result<(), String> {
    let chats = state
        .chats
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    for c in chats.iter() {
        if c.name == chat {
            // This needs to be in a separate closure to prevent `save_basic_chat_data` from deadlocking
            {
                let mut chat_you = c
                    .you
                    .lock()
                    .or(Err("Failed to get lock on state".to_owned()))?;
                *chat_you = you;
            }
            let theme = *state
                .theme
                .lock()
                .or(Err("Failed to get lock on state".to_owned()))?;
            let app_data_dir = handle
                .path()
                .app_local_data_dir()
                .map_err(|err| err.to_string())?;
            return save_basic_chat_data(&app_data_dir, &chats, theme);
        }
    }
    Err("Failed to find chat".to_owned())
}

/// Sets the current theme
/// # Parameters
/// * `theme` - Theme to use
#[tauri::command]
fn set_theme(theme: Theme, state: State<'_, AppState>, handle: AppHandle) -> Result<(), String> {
    let mut saved_theme = state
        .theme
        .lock()
        .or(Err("Failed to get lock on state".to_owned()))?;
    *saved_theme = theme;
    let app_data_dir = handle
        .path()
        .app_local_data_dir()
        .map_err(|err| err.to_string())?;
    if let Ok(data) = fs::read_to_string(app_data_dir.join(SAVE_NAME)) {
        let saved: Result<SavedChats, _> = serde_json::from_str(&data);
        match saved {
            Ok(s) => {
                let f =
                    fs::File::create(app_data_dir.join(SAVE_NAME)).map_err(|e| e.to_string())?;
                return serde_json::to_writer(
                    f,
                    &SavedChats {
                        theme,
                        chats: s.chats,
                    },
                )
                .map_err(|e| e.to_string());
            }
            _ => {}
        }
    }
    Ok(())
}

/// Gets the current theme, and sets it to the supplied theme if it's currently `UNSPECIFIED`
/// # Parameters
/// * `theme` - Theme to use if one isn't already saved
#[tauri::command]
fn get_set_theme_initial(
    theme: Theme,
    state: State<'_, AppState>,
    handle: AppHandle,
) -> Result<Theme, String> {
    let mut current_theme = Theme::UNSPECIFIED;
    if let Ok(app_data_dir) = handle.path().app_local_data_dir() {
        if let Ok(data) = fs::read_to_string(app_data_dir.join(SAVE_NAME)) {
            let saved: Result<SavedChats, _> = serde_json::from_str(&data);
            current_theme = match saved {
                Ok(s) => s.theme,
                _ => Theme::UNSPECIFIED,
            }
        }
    }

    match current_theme {
        Theme::UNSPECIFIED => {
            let mut saved_theme = state
                .theme
                .lock()
                .or(Err("Failed to get lock on state".to_owned()))?;
            *saved_theme = theme;
            Ok(theme)
        }
        _ => Ok(current_theme),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            chats: Vec::new().into(),
            theme: Theme::UNSPECIFIED.into(),
        })
        .invoke_handler(tauri::generate_handler![
            get_set_theme_initial,
            set_theme,
            set_you,
            load_chats,
            get_saved_chats,
            remove_chat,
            get_chat,
            search,
            star_message,
            get_starred,
            get_stats
        ])
        .run(tauri::generate_context!())
        .expect("Error while running application");
}
