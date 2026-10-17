// Open Space's icons, from Lucide (lucide.dev), all at one size and stroke, in the text colour around them.
// The rest of the page uses these names, so an icon is changed here only.
import {
  ArrowRight, Bell, BellOff, CalendarHeart, ChevronDown, ChevronUp, ChevronsUpDown, Command, Image, MessagesSquare, Monitor, Moon, Paperclip, Pause, Pencil,
  PictureInPicture2, Play, Plus, Power, Search, Settings, Shuffle, SkipForward, Sofa, Tag, Users, Volume2, VolumeX, X, type LucideIcon,
} from 'lucide-react';

const icon = (Shape: LucideIcon) => () => <Shape className="cp-icon" size={16} strokeWidth={1.75} aria-hidden="true" />;

export const PlusIcon = icon(Plus);
export const CrewIcon = icon(Users);
export const CommandIcon = icon(Command);
export const BellIcon = ({ muted }: { muted: boolean }) => (muted ? <BellOffIcon /> : <BellOnIcon />);
const BellOnIcon = icon(Bell);
const BellOffIcon = icon(BellOff);
export const SoundIcon = ({ muted }: { muted: boolean }) => (muted ? <SoundOffIcon /> : <SoundOnIcon />);
const SoundOnIcon = icon(Volume2);
const SoundOffIcon = icon(VolumeX);
export const PictureInPictureIcon = icon(PictureInPicture2);
export const PaperclipIcon = icon(Paperclip);
export const ImageIcon = icon(Image);
export const SearchIcon = icon(Search);
export const ChevronUpIcon = icon(ChevronUp);
export const ChevronDownIcon = icon(ChevronDown);
export const CloseIcon = icon(X);
export const PencilIcon = icon(Pencil);
export const PowerIcon = icon(Power);
export const TagIcon = icon(Tag);
/** The office. */
export const DeskIcon = icon(Monitor);
/** The break room. */
export const SofaIcon = icon(Sofa);
/** Putting a session to rest. */
export const RestIcon = icon(Moon);
export const PauseIcon = icon(Pause);
export const PlayIcon = icon(Play);
export const NextIcon = icon(SkipForward);
export const SendIcon = icon(ArrowRight);
/** The festivals and the hour of the room, to try them. */
export const CalendarIcon = icon(CalendarHeart);
export const SettingsIcon = icon(Settings);
/** A message from another session, when its sender is not someone of the crew. */
export const PeerIcon = icon(MessagesSquare);
/** Whoever is free: the person picker's choice when nobody is asked for. */
export const ShuffleIcon = icon(Shuffle);
export const ChevronsUpDownIcon = icon(ChevronsUpDown);
