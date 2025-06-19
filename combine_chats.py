import shutil
from abc import ABC, abstractmethod
from os.path import basename
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from itertools import permutations
from pathlib import Path
from tqdm import tqdm
from typing import Any, List, Optional, Set

# Common photo extensions
PHOTO_TYPES = [
    "png", "apng", "jpg", "jpeg", "gif", "webp", "avif", "jfif", "pjpeg", "pjp", "svg", "bmp",
    "ico", "tif", "tiff",
]

# Common video extensions
VIDEO_TYPES = ["mp4", "avi", "mov", "wmv", "mkv", "webm", "flv"]

# Common audio extensions
AUDIO_TYPES = ["opus", "mp3", "aac", "ogg", "wav"]

class MediaType(Enum):
    PHOTO = "PHOTO"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    OTHER = "OTHER"

class Version(Enum):
    OLD = "OLD"
    NEW = "NEW"

def convert_datetime(dt: datetime, version: Version):
    """Converts a datetime to its appropriate representation for `version`"""
    if version is Version.OLD:
        return f"{dt.month}/{dt.day}/{dt.strftime('%y')}, {12 if dt.hour == 0 else dt.hour if dt.hour <= 12 else dt.hour-12}:{dt.strftime('%M:%S %p')}"
    return f"{dt.month}/{dt.day}/{dt.strftime('%y')}, {12 if dt.hour == 0 else dt.hour if dt.hour <= 12 else dt.hour-12}:{dt.strftime('%M %p')}"

@dataclass
class Media:
    media_type: MediaType
    path: Optional[str]
    caption: Optional[str]

    def __eq__(self, other):
        if not isinstance(other, Media):
            return False
        if self.media_type is not MediaType.OTHER and other.media_type is not MediaType.OTHER and self.media_type != other.media_type:
            return False
        if self.caption is not None and other.caption is not None and self.caption != other.caption:
            return False
        return True

@dataclass
class Message(ABC):
    timestamp: datetime
    sender: Optional[str]
    content: Any

    @abstractmethod
    def to_version(self, version: Version) -> str:
        """Converts the message to its appropriate representation for an export `version`"""
        pass

    @abstractmethod
    def __eq__(self, other) -> bool:
        pass

@dataclass
class TextMessage(Message):
    content: str

    def to_version(self, version: Version):
        if version is Version.OLD:
            return f"[{convert_datetime(self.timestamp, version)}] {self.sender}: {self.content}"
        return f"{convert_datetime(self.timestamp, version)} - {self.sender}: {self.content}"

    def __eq__(self, other):
        if not isinstance(other, TextMessage):
            return False
        return abs(self.timestamp - other.timestamp) <= timedelta(days=1) and self.sender == other.sender and self.content == other.content

@dataclass
class MediaMessage(Message):
    content: Media

    def to_version(self, version: Version):
        if version is Version.OLD:
            return f"[{convert_datetime(self.timestamp, version)}] {self.sender}: <attached: {basename(self.content.path)}>"
        media = "<Media omitted" if self.content.path is None else f"{basename(self.content.path)} (file attached)"
        caption = f"\n{self.content.caption}" if self.content.caption is not None else ""
        return f"{convert_datetime(self.timestamp, version)} - {self.sender}: {media}{caption}"

    def __eq__(self, other):
        if not isinstance(other, MediaMessage):
            return False
        return abs(self.timestamp - other.timestamp) <= timedelta(days=1) and self.sender == other.sender and self.content == other.content

@dataclass
class SystemMessage(Message):
    content: str

    def to_version(self, version: Version):
        if version is Version.OLD:
            return f"[{convert_datetime(self.timestamp, version)}] {self.content}"
        return f"{convert_datetime(self.timestamp, version)} - {self.content}"

    def __eq__(self, other):
        if not isinstance(other, SystemMessage):
            return False
        return abs(self.timestamp - other.timestamp) <= timedelta(days=1) and self.sender == other.sender and self.content == other.content

class Chat:

    def __init__(self, messages: List[Message], file: Optional[Path]=None, directory: Optional[Path]=None, version: Optional[Version]=None):
        """
        Represents a WhatsApp chat

        Parameters
        ----------
        messages : list
            List of Messages
        file : Path, optional, default=None
            Path of the chat export file
        directory : Path, optional, default=None
            Path of the chat media directory
        version : Version, optional, default=None
            Version of the export `file`
        """
        self.file = file
        self.directory = directory
        self.messages = messages
        self.version = version

    @classmethod
    def from_file(cls, file: Path, directory: Path):
        """
        Builds a new chat from a `file` and associated `directory` of media

        Parameters
        ----------
        file : Path
            Export file to load
        directory : Path
            Directory in which to search for media
        """
        senders: Set[str] = set()
        available_files = {p.name for p in directory.iterdir() if p.is_file() and p != file}
        messages: List[Message] = []
        with open(file, "r", encoding="utf-8") as f:
            first = True
            for line in f:
                line = line.replace("\u200e", "").strip()
                if line.strip() == "":
                    continue
                # Check the chat version with the first message
                if first:
                    version = Version.NEW if line[0] != "[" else Version.OLD
                    first = False
                if version is Version.OLD:
                    # If the line doesn't start with a square bracket, it's the continuation of a previous message
                    if not line.startswith("["):
                        if messages and isinstance(messages[-1], TextMessage):
                            messages[-1].content = messages[-1].content + "\n" + line.strip()
                    else:
                        # Get the time end
                        time_end_idx = line.index("]")
                        timestamp = datetime.strptime(line[1:time_end_idx], "%m/%d/%y, %I:%M:%S %p")
                        try:
                            col_i = line[time_end_idx+2:].index(": ")
                            colon_idx = col_i + time_end_idx + 2
                            sender = line[time_end_idx+2:colon_idx]
                            senders.add(sender)
                            if "<attached: " in line:
                                attached_idx = line.index("<attached: ")
                                file_name = line[attached_idx+11:len(line)-1]
                                media_type = MediaType.OTHER
                                if any(file_name.lower().endswith(ext) for ext in PHOTO_TYPES):
                                    media_type = MediaType.PHOTO
                                elif any(file_name.lower().endswith(ext) for ext in VIDEO_TYPES):
                                    media_type = MediaType.VIDEO
                                elif any(file_name.lower().endswith(ext) for ext in AUDIO_TYPES):
                                    media_type = MediaType.AUDIO
                                messages.append(
                                    MediaMessage(
                                        timestamp,
                                        sender,
                                        Media(
                                            media_type,
                                            directory.joinpath(file_name) if file_name in available_files else None,
                                            None
                                        )
                                    )
                                )
                            elif line[colon_idx+2:].strip() == "This message was deleted.":
                                continue
                            else:
                                messages.append(TextMessage(
                                    timestamp,
                                    sender,
                                    line[colon_idx+2:].strip()
                                ))
                        except ValueError:
                            # Handle "system" messages
                            # They probably start with a previous user's name
                            sender = None
                            for s in senders:
                                if line[time_end_idx+2:].startswith(s):
                                    sender = s
                                    break
                            messages.append(SystemMessage(timestamp, sender, line[time_end_idx+2:].strip()))
                else:
                    try:
                        # Find the index of (A/P)M - <name>
                        dash_idx = line.index("M -")
                        if dash_idx <= 19:
                            timestamp = datetime.strptime(line[:dash_idx+1], "%m/%d/%y, %I:%M %p")
                            try:
                                col_i = line[dash_idx+4:].index(": ")
                                colon_idx = col_i + dash_idx + 4
                                sender = line[dash_idx+4:colon_idx]
                                senders.add(sender)
                                if "<Media omitted" in line:
                                    messages.append(MediaMessage(timestamp, sender, Media(MediaType.OTHER, None, None)))
                                elif line.endswith("(file attached)"):
                                    file_name = line[colon_idx+2:len(line)-16]
                                    media_type = MediaType.OTHER
                                    if any(file_name.lower().endswith(ext) for ext in PHOTO_TYPES):
                                        media_type = MediaType.PHOTO
                                    elif any(file_name.lower().endswith(ext) for ext in VIDEO_TYPES):
                                        media_type = MediaType.VIDEO
                                    elif any(file_name.lower().endswith(ext) for ext in AUDIO_TYPES):
                                        media_type = MediaType.AUDIO
                                    messages.append(
                                        MediaMessage(
                                            timestamp,
                                            sender,
                                            Media(
                                                media_type,
                                                directory.joinpath(file_name) if file_name in available_files else None,
                                                None
                                            )
                                        )
                                    )
                                elif line[colon_idx+2:].strip() != "null":
                                    messages.append(
                                        TextMessage(
                                            timestamp,
                                            sender,
                                            line[colon_idx+2:].strip()
                                        )
                                    )
                            except ValueError:
                                # Handle "system" messages
                                sender = None
                                for s in senders:
                                    if line[dash_idx+3:].startswith(s):
                                        sender = s
                                        break
                                messages.append(SystemMessage(timestamp, sender, line[dash_idx+3:].strip()))
                        else:
                            # If the dash is not in the first 19 characters, it's not part of the message time
                            if messages:
                                if isinstance(messages[-1], TextMessage):
                                    messages[-1].content = messages[-1].content + "\n" + line.strip()
                                elif isinstance(messages[-1], MediaMessage):
                                    if messages[-1].content.caption is None:
                                        messages[-1].content.caption = line.strip()
                                    else:
                                        messages[-1].content.caption = messages[-1].content.caption + "\n" + line.strip()
                    except ValueError:
                        # If there is no match, it's probably a continuation of the previous message
                        if messages:
                            if isinstance(messages[-1], TextMessage):
                                messages[-1].content = messages[-1].content + "\n" + line.strip()
                            elif isinstance(messages[-1], MediaMessage):
                                if messages[-1].content.caption is None:
                                    messages[-1].content.caption = line.strip()
                                else:
                                    messages[-1].content.caption = messages[-1].content.caption + "\n" + line.strip()
        
        # Try to fill in system message senders that were unknown at the time
        for m in messages:
            if isinstance(m, SystemMessage) and m.sender is None:
                for s in senders:
                    if m.content.startswith(s):
                        m.sender = s
                        break  
        
        return Chat(messages, file, directory, version)

    def to_version(self, version: Version, file=None, media_directory=None):
        """
        Converts the chat to a text export

        Parameters
        ----------
        version : Version
            Version of the export
        file : str, optional, default=None
            Where to export the file; if `None`, returns the export string instead
        media_directory : str, optional, default=None
            Where to copy media files
        """
        if media_directory is not None:
            for m in tqdm(self.messages):
                if isinstance(m, MediaMessage) and m.content.path is not None:
                    shutil.copy(m.content.path, media_directory)
        if file is None:
            return "\n".join(m.to_version(version) for m in self.messages)
        else:
            with open(file, "w", encoding="utf-8") as f:
                f.writelines("\n".join(m.to_version(version) for m in self.messages))

    def __getitem__(self, idx: int):
        return self.messages[idx]

    def __iter__(self):
        yield from self.messages

    def __len__(self):
        return len(self.messages)

MAX_SCRAMBLED_MESSAGES = 5
def combine_chats(chat1: Chat, chat2: Chat):
    """Combines two chats into a single new chat"""
    messages: List[Message] = []
    i = 0
    j = 0
    while i < len(chat1) and j < len(chat2):
        m1 = chat1[i]
        m2 = chat2[j]
        if m1 == m2:
            # Direct match - merge messages
            if isinstance(m1, MediaMessage):
                sender = m1.sender
                media_type = m1.content.media_type if m1.content.media_type is not MediaType.OTHER else m2.content.media_type
                caption = m1.content.caption if m1.content.caption is not None else m2.content.caption
                path = m1.content.path if m1.content.path is not None else m2.content.path
                messages.append(MediaMessage(m1.timestamp, sender, Media(media_type, path, caption)))
            else:
                messages.append(m1)
            j += 1
            i += 1
        else:
            found_match = False
            # Check out-of-order messages
            for num_to_check in range(2, MAX_SCRAMBLED_MESSAGES+1):
                if i + num_to_check > len(chat1) or j + num_to_check > len(chat2):
                    break
                for combo in permutations(range(num_to_check), num_to_check):
                    if all(chat1[i+c] == chat2[j+k] for k, c in enumerate(combo)):
                        for k, c in enumerate(combo):
                            m1 = chat1[i+c]
                            m2 = chat2[j+k]
                            if isinstance(m1, MediaMessage):
                                sender = m1.sender
                                media_type = m1.content.media_type if m1.content.media_type is not MediaType.OTHER else m2.content.media_type
                                caption = m1.content.caption if m1.content.caption is not None else m2.content.caption
                                path = m1.content.path if m1.content.path is not None else m2.content.path
                                messages.append(MediaMessage(m1.timestamp, sender, Media(media_type, path, caption)))
                            else:
                                messages.append(m1)
                        i += num_to_check
                        j += num_to_check
                        found_match = True
                        break
                if found_match:
                    break
            if found_match:
                continue
            elif i > 0 and j > 0:
                diff1 = chat1[i].timestamp - chat1[i-1].timestamp
                diff2 = chat2[j].timestamp - chat2[j-1].timestamp
                if diff1 > diff2 and (diff1 - diff2) > timedelta(days=1):
                    while j < len(chat2) and chat2[j] != chat1[i]:
                        messages.append(chat2[j])
                        j += 1
                    # i += 1
                    continue
                elif diff2 > diff1 and (diff2 - diff1) > timedelta(days=1):
                    while i < len(chat1) and chat2[j] != chat1[i]:
                        messages.append(chat1[i])
                        i += 1
                    # j += 1
                    continue
            # print("No match", m1, m2)
            # break

    if i < len(chat1):
        messages.extend(chat1.messages[i:])
    if j < len(chat2):
        messages.extend(chat2.messages[j:])

    return Chat(messages)

def check_for_duplicates(chat: Chat):
    """
    Checks for duplicate text and media messages (based on captions) within `chat`

    Parameters
    ----------
    chat : Chat
        Chat to check

    Returns
    -------
    duplicated_text : Counter
        `Counter` of duplicated text messages
    duplicated_media : Counter
        `Counter` of duplicated media messages based on caption
    """
    LENGTH = 15
    seen_text = set()
    seen_media = set()
    duplicated_text = Counter()
    duplicated_media = Counter()
    for m in chat:
        if isinstance(m, TextMessage):
            if len(m.content) > LENGTH:
                if m.content in seen_text:
                    duplicated_text[m.content] += 1
                seen_text.add(m.content)
        elif isinstance(m, MediaMessage):
            if m.content.caption is not None and len(m.content.caption) > LENGTH:
                if m.content.caption in seen_media:
                    duplicated_media[m.content.caption] += 1
                seen_media.add(m.content.caption)
    for k in duplicated_text.keys():
        duplicated_text[k] += 1
    for k in duplicated_media.keys():
        duplicated_media[k] += 1
    return duplicated_text, duplicated_media

if __name__ == "__main__":
    dir1 = Path(r"C:\Users\willd\Documents\WhatsApp chat\old_chat")
    file1 = dir1.joinpath("_chat_modified.txt")
    dir2 = Path(r"C:\Users\willd\Documents\WhatsApp chat\new_chat")
    file2 = dir2.joinpath("_chat2_modified.txt")

    old_chat = Chat.from_file(file1, dir1)
    new_chat = Chat.from_file(file2, dir2)
    combined_chat = combine_chats(old_chat, new_chat)
    print(len(old_chat), len(new_chat), len(combined_chat))
    print(check_for_duplicates(combined_chat))

    combined_chat.to_version(Version.NEW, "test.txt", media_directory="combined")
