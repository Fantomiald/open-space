// Open Space's icons, from Lucide (lucide.dev), all at one size and stroke, in the text colour around them.
// The rest of the page uses these names, so an icon is changed here only.
import {
  AppWindow, Archive, Eraser, GitBranch, GitMerge, GitPullRequest, ArrowLeft, Check, ArrowRight, Bell, BellOff, CalendarHeart, ChevronDown, ChevronUp, ChevronsUpDown, CircleAlert, Command, Download, Ellipsis, ExternalLink, File, Link, FileText, Image, Info, LayoutGrid, Maximize2, Minimize2, ListMusic, MessagesSquare, Monitor, Moon, PanelLeft, PanelLeftClose, PanelLeftOpen, Paperclip, Pause, Pencil, Palette, Play, Plus, Power, CircleDollarSign, Keyboard, NotebookPen, MessageSquareText, ChartColumn,
  Clock, Folder, FolderOpen, FolderPlus, FilePlus, Save, FileCode, FileBraces, FileImage, FileCog, FileLock, FileArchive, FilePlay, FileMusic, FileSpreadsheet, Copy, Languages, PartyPopper, Activity, TrendingUp, CalendarDays, Bot, CornerDownLeft, ArrowUpDown, ScrollText, Coffee, Gauge, Timer, Sparkles, ChevronLeft, ChevronRight, RotateCw, CopyPlus, Brain, Shrink, ListChecks, Workflow, Inbox, Search, Settings, Shuffle, SkipBack, SlidersHorizontal, SkipForward, Smartphone, Sofa, SquareTerminal, Star, Tag, Trash2, UserCheck, Users, Volume2, PawPrint, RotateCcw, VolumeX, X, Zap, Globe, PictureInPicture2, CodeXml, Eye, FolderSearch, type LucideIcon,
} from 'lucide-react';

const icon = (Shape: LucideIcon) => () => <Shape className="cp-icon" size={16} strokeWidth={1.75} aria-hidden="true" />;

export const PlusIcon = icon(Plus);
/** Focus mode: the sessions as a list beside their windows. */
export const FocusIcon = icon(PanelLeft);
export const FoldListIcon = icon(PanelLeftClose);
export const UnfoldListIcon = icon(PanelLeftOpen);
export const InfoIcon = icon(Info);
/** The windows laid out in a grid, or each placed by hand. */
export const GridIcon = icon(LayoutGrid);
export const FreeWindowsIcon = icon(AppWindow);
export const CrewIcon = icon(Users);
export const PetIcon = icon(PawPrint);
export const RemoveIcon = icon(Trash2);
export const ItsMeIcon = icon(UserCheck);
export const TurnLeftIcon = icon(RotateCcw);
export const TurnRightIcon = icon(RotateCw);
export const CommandIcon = icon(Command);
export const BellIcon = ({ muted }: { muted: boolean }) => (muted ? <BellOffIcon /> : <BellOnIcon />);
const BellOnIcon = icon(Bell);
const BellOffIcon = icon(BellOff);
export const SoundIcon = ({ muted }: { muted: boolean }) => (muted ? <SoundOffIcon /> : <SoundOnIcon />);
const SoundOnIcon = icon(Volume2);
const SoundOffIcon = icon(VolumeX);
export const PaperclipIcon = icon(Paperclip);
export const ImageIcon = icon(Image);
export const SearchIcon = icon(Search);
export const ChevronUpIcon = icon(ChevronUp);
export const ChevronDownIcon = icon(ChevronDown);
export const CheckIcon = icon(Check);
export const CloseIcon = icon(X);
export const PencilIcon = icon(Pencil);
export const StarIcon = icon(Star);
export const PowerIcon = icon(Power);
/** A session's browser (BrowserView). */
export const GlobeIcon = icon(Globe);
export const PipIcon = icon(PictureInPicture2);
export const TagIcon = icon(Tag);
/** Remote Control: the session reached from the phone or claude.ai. */
export const PhoneIcon = icon(Smartphone);
export const TerminalIcon = icon(SquareTerminal);
export const DownloadIcon = icon(Download);
export const FileIcon = icon(File);
export const FileTextIcon = icon(FileText);
export const ExternalLinkIcon = icon(ExternalLink);
/** The pages a session published on claude.ai. */
export const LinkIcon = icon(Link);
export const AlertIcon = icon(CircleAlert);
/** The office. */
export const DeskIcon = icon(Monitor);
/** The break room. */
export const SofaIcon = icon(Sofa);
/** Putting a session to rest. */
export const RestIcon = icon(Moon);
export const MoreIcon = icon(Ellipsis);
export const PauseIcon = icon(Pause);
export const PlayIcon = icon(Play);
export const NextIcon = icon(SkipForward);
export const PreviousIcon = icon(SkipBack);
export const LibraryIcon = icon(ListMusic);
export const SendIcon = icon(ArrowRight);
export const MaximizeIcon = icon(Maximize2);
export const MinimizeIcon = icon(Minimize2);
export const TuneIcon = icon(SlidersHorizontal);
export const UltracodeIcon = icon(Zap);
/** The festivals and the hour of the room, to try them. */
export const CalendarIcon = icon(CalendarHeart);
export const SettingsIcon = icon(Settings);
/** A message from another session, when its sender is not someone of the crew. */
export const PeerIcon = icon(MessagesSquare);
/** Whoever is free: the person picker's choice when nobody is asked for. */
export const ShuffleIcon = icon(Shuffle);
export const ChevronsUpDownIcon = icon(ChevronsUpDown);
export const BackIcon = icon(ArrowLeft);
export const RefreshIcon = icon(RotateCw);

/* The search palette and the settings: one icon per kind of result, per section and per row. */
export const CostIcon = icon(CircleDollarSign);
export const KeyboardIcon = icon(Keyboard);
export const NotesIcon = icon(NotebookPen);
export const MessageIcon = icon(MessageSquareText);
export const ChartIcon = icon(ChartColumn);
export const ClockIcon = icon(Clock);
export const FolderIcon = icon(Folder);
export const FolderOpenIcon = icon(FolderOpen);
export const NewFolderIcon = icon(FolderPlus);
export const NewFileIcon = icon(FilePlus);
export const SaveIcon = icon(Save);
export const CodeIcon = icon(CodeXml);
export const PreviewIcon = icon(Eye);
export const RevealIcon = icon(FolderSearch);
/** A file of the explorer, by kind (see fileKind in src/state/files.ts). */
export const FileCodeIcon = icon(FileCode);
export const FileDataIcon = icon(FileBraces);
export const FileImageIcon = icon(FileImage);
export const FileConfigIcon = icon(FileCog);
export const FileLockIcon = icon(FileLock);
export const FileArchiveIcon = icon(FileArchive);
export const FileVideoIcon = icon(FilePlay);
export const FileAudioIcon = icon(FileMusic);
export const FileTableIcon = icon(FileSpreadsheet);
export const CopyIcon = icon(Copy);
export const LanguageIcon = icon(Languages);
export const FestivalIcon = icon(PartyPopper);
export const ActivityIcon = icon(Activity);
export const TrendIcon = icon(TrendingUp);
export const WeekIcon = icon(CalendarDays);
export const AgentIcon = icon(Bot);
export const EnterIcon = icon(CornerDownLeft);
export const ArrowsIcon = icon(ArrowUpDown);
export const ChangelogIcon = icon(ScrollText);
export const CoffeeIcon = icon(Coffee);
export const GaugeIcon = icon(Gauge);
export const TimerIcon = icon(Timer);
export const SparklesIcon = icon(Sparkles);
export const PaletteIcon = icon(Palette);
export const ThinkingIcon = icon(Brain);
export const DuplicateIcon = icon(CopyPlus);
export const CompactIcon = icon(Shrink);
export const PlanIcon = icon(ListChecks);
export const WorkflowIcon = icon(Workflow);
export const InboxIcon = icon(Inbox);
export const PeakIcon = icon(Zap);
export const ChevronLeftIcon = icon(ChevronLeft);
export const ChevronRightIcon = icon(ChevronRight);

/* A session on a branch of its own (worktrees): its branch, merging it, a pull request, keeping it, the cleaning panel. */
export const BranchIcon = icon(GitBranch);
export const MergeIcon = icon(GitMerge);
export const PullRequestIcon = icon(GitPullRequest);
export const KeepIcon = icon(Archive);
export const CleanIcon = icon(Eraser);
