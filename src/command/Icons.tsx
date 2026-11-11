// Open Space's icons, from Lucide (lucide.dev), all at one size and stroke, in the text colour around them.
// The rest of the page uses these names, so an icon is changed here only.
import type { ReactNode } from 'react';
import type { ModIcon } from '../../shared/mods.ts';
import {
  AppWindow, Archive, ShieldCheck, Blend, Cpu, Eraser, FileDiff, GitBranch, GitMerge, GitPullRequest, ArrowLeft, Check, ArrowRight, Bell, BellOff, CalendarHeart, ChevronDown, ChevronUp, ChevronsUpDown, CircleAlert, Command, Download, Ellipsis, ExternalLink, File, Link, FileText, Image, Info, LayoutGrid, Maximize2, Minimize2, ListMusic, MessagesSquare, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Paperclip, Pause, Pencil, Palette, Play, Plus, Power, CircleDollarSign, Keyboard, NotebookPen, MessageSquareText, ChartColumn,
  Clock, Folder, FolderOpen, FolderPlus, FilePlus, Save, FileCode, FileBraces, FileImage, FileCog, FileLock, FileArchive, FilePlay, FileMusic, FileSpreadsheet, Copy, Languages, PartyPopper, Activity, Webhook, TrendingUp, CalendarDays, Bot, CornerDownLeft, ArrowUpDown, ScrollText, Coffee, Gauge, Timer, Sparkles, ChevronLeft, ChevronRight, RotateCw, CopyPlus, Brain, Shrink, ListChecks, Workflow, Inbox, Search, Settings, Shuffle, SkipBack, SlidersHorizontal, SkipForward, Smartphone, Sofa, Square, SquareTerminal, Star, Tag, Trash2, UserCheck, Users, Volume2, PawPrint, RotateCcw, VolumeX, X, Zap, Globe, KeyRound, PictureInPicture2, Pin, PinOff, SquareArrowOutUpRight, SquareArrowDownLeft,CodeXml, Eye, FolderSearch, type LucideIcon, List, Puzzle, Coins, ChartLine, Heart,
  Radio, Focus, ListFilter,
} from 'lucide-react';

const icon = (Shape: LucideIcon) => () => <Shape className="cp-icon" size={16} strokeWidth={1.75} aria-hidden="true" />;

/** The mods (shared/mods.ts): the header's button and the pictures a mod may wear. */
export const ModsIcon = icon(Puzzle);
export const MOD_ICONS: Record<ModIcon, () => ReactNode> = {
  puzzle: icon(Puzzle), chart: icon(ChartLine), bars: icon(ChartColumn), coins: icon(Coins), timer: icon(Timer), list: icon(List), bell: icon(Bell),
  calendar: icon(CalendarDays), star: icon(Star), heart: icon(Heart), bolt: icon(Zap), globe: icon(Globe), note: icon(NotebookPen), terminal: icon(SquareTerminal),
};

export const PlusIcon = icon(Plus);
/** Each action of a session on its own in its thread, with its diff or what it gave back (Preferences.detailedActions). */
export const DiffIcon = icon(FileDiff);
/** Focus mode: the sessions as a list beside their windows. */
export const FocusIcon = icon(Focus);
export const FilterIcon = icon(ListFilter);
export const FoldListIcon = icon(PanelLeftClose);
export const UnfoldListIcon = icon(PanelLeftOpen);
export const InfoIcon = icon(Info);
export const FreeWindowsIcon = icon(AppWindow);
/** The floating windows docked back in the grid. */
export const TidyIcon = icon(LayoutGrid);
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
export const SoundOffIcon = icon(VolumeX);
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
/** A window taken out of Open Space (src/state/out.ts): out, back in, kept over the other apps or not. */
export const PopOutIcon = icon(SquareArrowOutUpRight);
export const PutBackIcon = icon(SquareArrowDownLeft);
export const PinIcon = icon(Pin);
export const UnpinIcon = icon(PinOff);
export const TagIcon = icon(Tag);
export const KeyIcon = icon(KeyRound);
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
export const StopIcon = icon(Square);
export const NextIcon = icon(SkipForward);
export const PreviousIcon = icon(SkipBack);
export const LibraryIcon = icon(ListMusic);
export const RadioIcon = icon(Radio);
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
/** an automaton: a headless agent of the user's orchestrator, watched read-only (shared/automata.ts) */
export const AutomatonIcon = icon(Cpu);
export const WebhookIcon = icon(Webhook);
export const EnterIcon = icon(CornerDownLeft);
export const ArrowsIcon = icon(ArrowUpDown);
export const ChangelogIcon = icon(ScrollText);
export const CoffeeIcon = icon(Coffee);
export const GaugeIcon = icon(Gauge);
export const TimerIcon = icon(Timer);
export const SparklesIcon = icon(Sparkles);
export const PaletteIcon = icon(Palette);
export const OpacityIcon = icon(Blend);
export const ThinkingIcon = icon(Brain);
export const DuplicateIcon = icon(CopyPlus);
export const CompactIcon = icon(Shrink);
export const PlanIcon = icon(ListChecks);
export const RulesIcon = icon(ShieldCheck);
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

/** The official marks of the chat apps (Simple Icons, CC0), in a tile of their colour (design/components.css, .cp-brand). */
const BRAND_PATHS = {
  telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  slack: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z',
  discord: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
} as const;
export type Brand = keyof typeof BRAND_PATHS;
export const BrandIcon = ({ brand }: { brand: Brand }) => (
  <span className="cp-brand" data-brand={brand} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d={BRAND_PATHS[brand]} /></svg>
  </span>
);
