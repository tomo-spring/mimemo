"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Circle,
  Flex,
  Grid,
  Heading,
  HStack,
  IconButton,
  Input,
  Separator,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea
} from "@chakra-ui/react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  ListChecks,
  Lock,
  Mic,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  Square,
  Upload,
  Users,
  Wand2,
  X
} from "lucide-react";

type AppTab = "record" | "minutes" | "summary" | "tasks" | "library" | "settings";
type RecordingStatus = "recording" | "paused" | "stopped";
type UploadStatus = "idle" | "processing" | "done" | "error";
type WebRecorderStatus = "idle" | "recording" | "stopping";
type RecorderSource = "pc" | "meet";

type Meeting = {
  id: string;
  title: string;
  time: string;
  participants: string;
  status: "recording" | "ready" | "draft";
  length: string;
  tags: string[];
};

type TaskItem = {
  id: number;
  title: string;
  owner: string;
  due: string;
  source: string;
  done: boolean;
  priority: "高" | "中" | "低";
};

type NavTab = {
  value: AppTab;
  label: string;
  description: string;
  icon: LucideIcon;
};

type ApiSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};

type ApiEvidenceItem =
  | string
  | {
      text?: string;
      task?: string;
      owner?: string | null;
      due?: string | null;
      evidence?: string[];
    };

type MinutesResponse = {
  overview?: string;
  decisions?: ApiEvidenceItem[];
  todos?: ApiEvidenceItem[];
  topics?: string[];
  open_questions?: string[];
  unclear?: string[];
  transcript?: ApiSegment[];
  chunk_count?: number;
};

type ApiErrorResponse = {
  detail?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_MIMEMO_API_BASE_URL ?? "http://127.0.0.1:8000";
const AUDIO_ACCEPT = ".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg";
const SUPPORTED_AUDIO_EXTENSIONS = [".wav", ".mp3"];

const navTabs: NavTab[] = [
  { value: "record", label: "録音", description: "会議を取り込む", icon: Mic },
  { value: "minutes", label: "議事録", description: "編集と共有", icon: FileText },
  { value: "summary", label: "要約", description: "決定事項を整理", icon: Sparkles },
  { value: "tasks", label: "タスク", description: "担当と期限を確認", icon: ListChecks },
  { value: "library", label: "ライブラリ", description: "過去会議を探す", icon: FolderOpen },
  { value: "settings", label: "設定", description: "連携とテンプレート", icon: Settings }
];

const meetings: Meeting[] = [
  {
    id: "product-weekly",
    title: "プロダクト定例",
    time: "今日 13:00",
    participants: "Aoi, Ken, Nao",
    status: "recording",
    length: "18:24",
    tags: ["β版", "価格", "オンボーディング"]
  },
  {
    id: "customer-interview",
    title: "顧客ヒアリング",
    time: "今日 15:30",
    participants: "Sales, CS",
    status: "ready",
    length: "予約済み",
    tags: ["顧客課題", "質問リスト"]
  },
  {
    id: "design-review",
    title: "デザインレビュー",
    time: "昨日 10:00",
    participants: "Design, PM",
    status: "draft",
    length: "42分",
    tags: ["UI", "改善案"]
  }
];

const transcriptLines = [
  { speaker: "Aoi", time: "13:04", text: "β版の対象は、まず10チームに限定して検証します。" },
  { speaker: "Ken", time: "13:09", text: "価格ページは現在の3プラン構成を維持しつつ、導入事例を前面に出したいです。" },
  { speaker: "Nao", time: "13:16", text: "初回オンボーディングでは、録音Botの参加許可を最初に案内します。" }
];

const decisions = [
  "β版は小規模チーム向けに段階公開する",
  "価格ページは事例中心の構成へ変更する",
  "オンボーディングに録音Botの権限チェックを追加する"
];

const initialTasks: TaskItem[] = [
  {
    id: 1,
    title: "価格ページの導入事例セクションを更新",
    owner: "Ken",
    due: "今日 17:00",
    source: "プロダクト定例",
    done: false,
    priority: "高"
  },
  {
    id: 2,
    title: "録音Botの権限確認フローを仕様に追記",
    owner: "Nao",
    due: "明日",
    source: "プロダクト定例",
    done: true,
    priority: "中"
  },
  {
    id: 3,
    title: "β版ユーザー10チームの候補を整理",
    owner: "Aoi",
    due: "金曜",
    source: "営業週次",
    done: false,
    priority: "中"
  }
];

const savedMeetings = [
  { title: "営業週次ミーティング", meta: "42分・8タスク・3決定事項", owner: "Sales", saved: "今日" },
  { title: "新機能アイデア会", meta: "28分・要約済み", owner: "Product", saved: "昨日" },
  { title: "採用面談メモ", meta: "35分・非公開", owner: "HR", saved: "月曜" },
  { title: "経営会議", meta: "58分・閲覧制限あり", owner: "Board", saved: "先週" }
];

const templateOptions = ["標準", "短め", "意思決定重視"];

function apiErrorMessage(data: MinutesResponse | ApiErrorResponse) {
  return "detail" in data && data.detail ? data.detail : "API request failed";
}

function normalizeSegments(segments: ApiSegment[] | undefined) {
  return (segments ?? [])
    .map((segment) => {
      const start = Number(segment.start);
      const end = Number(segment.end);

      return {
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : Number.isFinite(start) ? start : 0,
        speaker: segment.speaker?.trim() || "unknown",
        text: String(segment.text ?? "").trim()
      };
    })
    .filter((segment) => segment.text.length > 0);
}

function evidenceItemText(item: ApiEvidenceItem, preferredKey: "text" | "task") {
  if (typeof item === "string") {
    return item.trim();
  }

  return (item[preferredKey] ?? item.text ?? item.task ?? "").trim();
}

function cleanStrings(values: Array<string | undefined | null>) {
  return values.map((value) => value?.trim() ?? "").filter(Boolean);
}

function tasksFromMinutes(result: MinutesResponse, source: string) {
  const baseId = Date.now();

  return (result.todos ?? []).flatMap((todo, index): TaskItem[] => {
    const title = evidenceItemText(todo, "task");
    if (!title) return [];

    const owner = typeof todo === "string" ? "未設定" : todo.owner?.trim() || "未設定";
    const due = typeof todo === "string" ? "未設定" : todo.due?.trim() || "未設定";
    const priority: TaskItem["priority"] = index === 0 ? "高" : "中";

    return [
      {
        id: baseId + index,
        title,
        owner,
        due,
        source,
        done: false,
        priority
      }
    ];
  });
}

function formatMinutes(result: MinutesResponse, transcript: ApiSegment[]) {
  const sections: string[] = [];
  const overview = result.overview?.trim();
  const decisions = cleanStrings(result.decisions?.map((item) => evidenceItemText(item, "text")) ?? []);
  const todos = cleanStrings(result.todos?.map((item) => formatTodo(item)) ?? []);
  const topics = cleanStrings(result.topics ?? []);
  const openQuestions = cleanStrings(result.open_questions ?? []);
  const unclear = cleanStrings(result.unclear ?? []);

  if (overview) sections.push(`概要:\n${overview}`);
  if (decisions.length > 0) sections.push(`決定事項:\n${decisions.map((item) => `- ${item}`).join("\n")}`);
  if (todos.length > 0) sections.push(`タスク:\n${todos.map((item) => `- ${item}`).join("\n")}`);
  if (topics.length > 0) sections.push(`論点:\n${topics.map((item) => `- ${item}`).join("\n")}`);
  if (openQuestions.length > 0) sections.push(`未解決:\n${openQuestions.map((item) => `- ${item}`).join("\n")}`);
  if (unclear.length > 0) sections.push(`要確認:\n${unclear.map((item) => `- ${item}`).join("\n")}`);
  if (transcript.length > 0) {
    sections.push(`文字起こし:\n${transcript.map((segment) => `- [${formatTimestamp(segment.start)}] ${segment.speaker || "unknown"}: ${segment.text}`).join("\n")}`);
  }

  return sections.join("\n\n") || "議事録を生成できませんでした。";
}

function formatTodo(item: ApiEvidenceItem) {
  const title = evidenceItemText(item, "task");
  if (!title || typeof item === "string") return title;

  const meta = cleanStrings([item.owner ? `担当: ${item.owner}` : "", item.due ? `期限: ${item.due}` : ""]);
  return meta.length > 0 ? `${title}（${meta.join(" / ")}）` : title;
}

function formatTimestamp(value: number) {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

function uploadStatusLabel(status: UploadStatus) {
  if (status === "processing") return "処理中";
  if (status === "done") return "完了";
  if (status === "error") return "エラー";
  return "待機";
}

function uploadStatusDetail(status: UploadStatus) {
  if (status === "processing") return "文字起こしと要約を実行中";
  if (status === "done") return "文字起こしと要約が完了";
  if (status === "error") return "API応答を確認";
  return "API接続待ち";
}

function uploadStatusColor(status: UploadStatus) {
  if (status === "processing") return "blue";
  if (status === "done") return "teal";
  if (status === "error") return "red";
  return "gray";
}

function buildShareText(summary: MinutesResponse, decisionTexts: string[]) {
  const overview = summary.overview?.trim();
  const todoCount = summary.todos?.length ?? 0;
  const decisionSummary = decisionTexts.length > 0 ? `主な決定事項は「${decisionTexts[0]}」です。` : "";
  const taskSummary = todoCount > 0 ? `抽出タスクは${todoCount}件です。` : "";

  return cleanStrings([overview, decisionSummary, taskSummary]).join(" ");
}

function isSupportedAudioFile(file: File) {
  const fileName = file.name.toLowerCase();

  return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function getRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = ["audio/webm;codecs=opus", "audio/webm"];

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function recordingFileName(source: RecorderSource) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sourceLabel = source === "meet" ? "google-meet" : "pc";

  return `mimemo-${sourceLabel}-${timestamp}.wav`;
}

async function recordingBlobToWavFile(blob: Blob, source: RecorderSource) {
  const AudioContextConstructor =
    window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("WAV変換を開始できません。");
  }

  const audioContext = new AudioContextConstructor();

  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const wavBlob = audioBufferToWavBlob(audioBuffer);

    return new File([wavBlob], recordingFileName(source), { type: "audio/wav" });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function audioBufferToWavBlob(audioBuffer: AudioBuffer) {
  const channelCount = Math.min(audioBuffer.numberOfChannels, 2);
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  let offset = 0;

  offset = writeAscii(view, offset, "RIFF");
  view.setUint32(offset, 36 + dataLength, true);
  offset += 4;
  offset = writeAscii(view, offset, "WAVE");
  offset = writeAscii(view, offset, "fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, audioBuffer.sampleRate, true);
  offset += 4;
  view.setUint32(offset, audioBuffer.sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;
  offset = writeAscii(view, offset, "data");
  view.setUint32(offset, dataLength, true);
  offset += 4;

  const channelData = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));

  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }

  return offset + value.length;
}

function recorderStatusLabel(status: WebRecorderStatus) {
  if (status === "recording") return "録音中";
  if (status === "stopping") return "処理準備中";
  return "待機";
}

function recorderSourceLabel(source: RecorderSource | null) {
  if (source === "pc") return "このPC";
  if (source === "meet") return "Google Meet";
  return "未選択";
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<AppTab>("record");
  const [activeMeetingId, setActiveMeetingId] = useState(meetings[0].id);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("stopped");
  const [tasks, setTasks] = useState(initialTasks);
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "done">("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [template, setTemplate] = useState(templateOptions[0]);
  const [minutes, setMinutes] = useState(
    "目的: β版公開前に価格訴求とオンボーディング導線を確認する。\n\n決定事項:\n- β版は小規模チーム向けに段階公開する\n- 価格ページは導入事例を中心に構成する\n\n次回確認:\n- 10チーム分の候補リスト\n- 録音Botの権限説明文"
  );
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [apiTranscript, setApiTranscript] = useState<ApiSegment[]>([]);
  const [apiSummary, setApiSummary] = useState<MinutesResponse | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [webRecorderStatus, setWebRecorderStatus] = useState<WebRecorderStatus>("idle");
  const [webRecorderSource, setWebRecorderSource] = useState<RecorderSource | null>(null);
  const [webRecorderError, setWebRecorderError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const activeMeeting = meetings.find((meeting) => meeting.id === activeMeetingId) ?? meetings[0];

  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === "open") return !task.done;
    if (taskFilter === "done") return task.done;
    return true;
  });

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = libraryQuery.trim().toLowerCase();

    if (!normalizedQuery) return savedMeetings;

    return savedMeetings.filter((meeting) =>
      `${meeting.title} ${meeting.meta} ${meeting.owner}`.toLowerCase().includes(normalizedQuery)
    );
  }, [libraryQuery]);

  function toggleTask(id: number) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  useEffect(() => {
    return () => {
      stopMediaStream();
    };
  }, []);

  async function processAudio(file: File) {
    if (!isSupportedAudioFile(file)) {
      setSelectedFileName(file.name);
      setUploadStatus("error");
      setUploadError("対応音声はWAVとMP3です。");
      setActiveTab("record");
      return;
    }

    setSelectedFileName(file.name);
    setUploadStatus("processing");
    setUploadError("");
    setActiveTab("record");

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/minutes`, {
        method: "POST",
        body
      });
      const data = (await response.json().catch(() => ({}))) as MinutesResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(apiErrorMessage(data));
      }

      const result = data as MinutesResponse;
      const transcript = normalizeSegments(result.transcript);
      const extractedTasks = tasksFromMinutes(result, file.name);

      setApiTranscript(transcript);
      setApiSummary(result);
      setMinutes(formatMinutes(result, transcript));
      if (extractedTasks.length > 0) {
        setTasks(extractedTasks);
      }
      setUploadStatus("done");
      setActiveTab("summary");
    } catch (error) {
      setUploadStatus("error");
      setUploadError(error instanceof Error ? error.message : "API request failed");
    }
  }

  async function startWebRecording(source: RecorderSource) {
    if (webRecorderStatus !== "idle") return;

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setWebRecorderError("このブラウザでは録音を開始できません。");
      return;
    }

    setWebRecorderError("");
    setUploadError("");
    setActiveTab("record");

    try {
      const stream =
        source === "pc"
          ? await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            })
          : await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true
            });

      if (source === "meet" && stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        setWebRecorderError("Google Meetの音声を取得できませんでした。タブ音声を含めて選択してください。");
        return;
      }

      const recorderStream = source === "meet" ? new MediaStream(stream.getAudioTracks()) : stream;
      const mimeType = getRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(recorderStream, { mimeType }) : new MediaRecorder(recorderStream);

      recordingChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setWebRecorderError("録音中にエラーが発生しました。");
        stopWebRecording();
      };
      recorder.onstop = () => {
        void finishWebRecording(source, recorder.mimeType || mimeType || "audio/webm");
      };
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (mediaRecorderRef.current?.state === "recording") {
            stopWebRecording();
          }
        });
      });

      recorder.start(1000);
      setMeetingModalOpen(false);
      setWebRecorderSource(source);
      setWebRecorderStatus("recording");
      setRecordingStatus("recording");
    } catch (error) {
      stopMediaStream();
      setWebRecorderStatus("idle");
      setWebRecorderSource(null);
      setWebRecorderError(error instanceof Error ? error.message : "録音を開始できませんでした。");
    }
  }

  function stopWebRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      setWebRecorderStatus("stopping");
      recorder.stop();
      return;
    }

    stopMediaStream();
    setWebRecorderStatus("idle");
    setWebRecorderSource(null);
  }

  async function finishWebRecording(source: RecorderSource, mimeType: string) {
    const chunks = recordingChunksRef.current;
    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
    stopMediaStream();

    if (chunks.length === 0) {
      setWebRecorderStatus("idle");
      setWebRecorderSource(null);
      setRecordingStatus("stopped");
      setWebRecorderError("録音データが空です。");
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    let file: File;

    try {
      file = await recordingBlobToWavFile(blob, source);
    } catch (error) {
      setWebRecorderStatus("idle");
      setWebRecorderSource(null);
      setRecordingStatus("stopped");
      setWebRecorderError(error instanceof Error ? error.message : "WAV変換に失敗しました。");
      return;
    }

    setRecordingStatus("stopped");
    await processAudio(file);
    setWebRecorderStatus("idle");
    setWebRecorderSource(null);
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function handleAudioInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      void processAudio(file);
    }
    event.currentTarget.value = "";
  }

  return (
    <Box minH="100vh" bg="#f6f8fb" color="#1f2937">
      <Flex minH="100vh" direction={{ base: "column", lg: "row" }}>
        <Sidebar activeTab={activeTab} onChange={setActiveTab} />

        <Box as="main" flex="1" minW={0} px={{ base: 4, md: 8 }} py={{ base: 4, md: 6 }}>
          <TopBar
            activeMeeting={activeMeeting}
            onUploadChange={handleAudioInputChange}
            uploadDisabled={uploadStatus === "processing" || webRecorderStatus !== "idle"}
            onNewMeetingClick={() => setMeetingModalOpen(true)}
            newMeetingDisabled={uploadStatus === "processing" || webRecorderStatus !== "idle"}
          />
          <NewMeetingModal
            open={meetingModalOpen}
            recorderStatus={webRecorderStatus}
            recorderError={webRecorderError}
            onClose={() => setMeetingModalOpen(false)}
            onRecordOnPc={() => void startWebRecording("pc")}
            onRecordGoogleMeet={() => void startWebRecording("meet")}
          />

          <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 320px" }} gap={5} alignItems="start">
            <Box minW={0}>
              <Tabs.Root value={activeTab} onValueChange={(details) => setActiveTab(details.value as AppTab)}>
                <Tabs.List
                  display={{ base: "flex", lg: "none" }}
                  overflowX="auto"
                  gap={2}
                  mb={4}
                  p={1}
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="lg"
                >
                  {navTabs.map((tab) => {
                    const Icon = tab.icon;

                    return (
                      <Tabs.Trigger key={tab.value} value={tab.value} asChild>
                        <Button
                          variant={activeTab === tab.value ? "solid" : "ghost"}
                          colorPalette={activeTab === tab.value ? "teal" : "gray"}
                          size="sm"
                          flexShrink={0}
                        >
                          <Icon size={16} />
                          {tab.label}
                        </Button>
                      </Tabs.Trigger>
                    );
                  })}
                </Tabs.List>

                <Tabs.Content value="record">
                  <RecordTab
                    activeMeeting={activeMeeting}
                    recordingStatus={recordingStatus}
                    uploadStatus={uploadStatus}
                    uploadError={uploadError}
                    selectedFileName={selectedFileName}
                    apiBaseUrl={API_BASE_URL}
                    transcript={apiTranscript}
                    webRecorderStatus={webRecorderStatus}
                    webRecorderSource={webRecorderSource}
                    webRecorderError={webRecorderError}
                    onStopWebRecording={stopWebRecording}
                    onMeetingChange={setActiveMeetingId}
                    onToggleRecording={() =>
                      setRecordingStatus((current) => (current === "recording" ? "paused" : "recording"))
                    }
                  />
                </Tabs.Content>

                <Tabs.Content value="minutes">
                  <MinutesTab minutes={minutes} onChange={setMinutes} template={template} onTemplateChange={setTemplate} />
                </Tabs.Content>

                <Tabs.Content value="summary">
                  <SummaryTab summary={apiSummary} />
                </Tabs.Content>

                <Tabs.Content value="tasks">
                  <TasksTab tasks={filteredTasks} filter={taskFilter} onFilterChange={setTaskFilter} onToggleTask={toggleTask} />
                </Tabs.Content>

                <Tabs.Content value="library">
                  <LibraryTab query={libraryQuery} onQueryChange={setLibraryQuery} meetings={filteredMeetings} />
                </Tabs.Content>

                <Tabs.Content value="settings">
                  <SettingsTab template={template} onTemplateChange={setTemplate} />
                </Tabs.Content>
              </Tabs.Root>
            </Box>

            <RightRail
              activeMeeting={activeMeeting}
              recordingStatus={recordingStatus}
              tasks={tasks}
              onToggleRecording={() =>
                setRecordingStatus((current) => (current === "recording" ? "paused" : "recording"))
              }
              onStopRecording={() => setRecordingStatus("stopped")}
            />
          </Grid>
        </Box>
      </Flex>
    </Box>
  );
}

function Sidebar({ activeTab, onChange }: { activeTab: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <Box
      as="aside"
      w={{ base: "100%", lg: "280px" }}
      borderRight={{ base: "0", lg: "1px solid" }}
      borderBottom={{ base: "1px solid", lg: "0" }}
      borderColor="gray.200"
      bg="rgba(255,255,255,0.86)"
      px={{ base: 4, lg: 5 }}
      py={{ base: 4, lg: 6 }}
      position={{ base: "static", lg: "sticky" }}
      top="0"
      h={{ base: "auto", lg: "100vh" }}
    >
      <Box mb={{ base: 4, lg: 8 }}>
        <Text fontSize="2xl" fontWeight="600" color="#111827" lineHeight="1">
          Mimemo
        </Text>
      </Box>

      <Stack gap={2} display={{ base: "none", lg: "flex" }}>
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;

          return (
            <Button
              key={tab.value}
              justifyContent="flex-start"
              h="58px"
              px={3}
              variant={isActive ? "subtle" : "ghost"}
              colorPalette={isActive ? "teal" : "gray"}
              borderRadius="md"
              fontWeight="500"
              onClick={() => onChange(tab.value)}
            >
              <Circle size="34px" bg={isActive ? "white" : "gray.100"} color={isActive ? "teal.600" : "gray.500"}>
                <Icon size={17} />
              </Circle>
              <Box textAlign="left">
                <Text fontSize="sm">{tab.label}</Text>
                <Text fontSize="xs" color={isActive ? "teal.700" : "gray.500"} fontWeight="400">
                  {tab.description}
                </Text>
              </Box>
            </Button>
          );
        })}
      </Stack>

      <Box display={{ base: "none", lg: "block" }} mt={8} p={4} borderRadius="lg" bg="#f3fbf9" border="1px solid" borderColor="teal.100">
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" color="gray.600">
            今週の処理
          </Text>
          <Badge colorPalette="teal" variant="subtle">
            74%
          </Badge>
        </HStack>
        <Box h="8px" borderRadius="full" bg="white" overflow="hidden">
          <Box h="full" w="74%" bg="teal.400" />
        </Box>
        <Text mt={3} fontSize="xs" color="gray.500" lineHeight="1.6">
          12件の会議を保存。未確認タスクは2件です。
        </Text>
      </Box>
    </Box>
  );
}

function TopBar({
  activeMeeting,
  onUploadChange,
  uploadDisabled,
  onNewMeetingClick,
  newMeetingDisabled
}: {
  activeMeeting: Meeting;
  onUploadChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadDisabled: boolean;
  onNewMeetingClick: () => void;
  newMeetingDisabled: boolean;
}) {
  return (
    <Flex
      align={{ base: "flex-start", md: "center" }}
      justify="space-between"
      direction={{ base: "column", md: "row" }}
      gap={4}
      mb={5}
    >
      <Box>
        <Text fontSize="sm" color="gray.500">
          {activeMeeting.time}・{activeMeeting.participants}
        </Text>
        <Heading as="h1" size="2xl" fontWeight="500" letterSpacing="0">
          {activeMeeting.title}
        </Heading>
      </Box>

      <HStack gap={2}>
        <Box position="relative" display="inline-flex">
          <Button variant="outline" colorPalette="gray" size="sm" disabled={uploadDisabled} pointerEvents="none">
            <Upload size={16} />
            音声を追加
          </Button>
          <Input
            aria-label="音声を追加"
            type="file"
            accept={AUDIO_ACCEPT}
            position="absolute"
            inset="0"
            w="100%"
            h="100%"
            opacity="0"
            p="0"
            border="0"
            cursor={uploadDisabled ? "not-allowed" : "pointer"}
            disabled={uploadDisabled}
            onChange={onUploadChange}
          />
        </Box>
        <Button colorPalette="teal" size="sm" onClick={onNewMeetingClick} disabled={newMeetingDisabled}>
          <Plus size={16} />
          新規会議
        </Button>
        <IconButton aria-label="通知" variant="ghost" colorPalette="gray" size="sm">
          <Bell size={18} />
        </IconButton>
      </HStack>
    </Flex>
  );
}

function NewMeetingModal({
  open,
  recorderStatus,
  recorderError,
  onClose,
  onRecordOnPc,
  onRecordGoogleMeet
}: {
  open: boolean;
  recorderStatus: WebRecorderStatus;
  recorderError: string;
  onClose: () => void;
  onRecordOnPc: () => void;
  onRecordGoogleMeet: () => void;
}) {
  if (!open) return null;

  const isBusy = recorderStatus !== "idle";

  return (
    <Flex position="fixed" inset="0" zIndex="modal" bg="rgba(15, 23, 42, 0.38)" align="center" justify="center" px={4}>
      <Box role="dialog" aria-modal="true" bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200" boxShadow="0 24px 80px rgba(15, 23, 42, 0.22)" w="100%" maxW="520px" p={{ base: 4, md: 5 }}>
        <HStack justify="space-between" align="flex-start" mb={4}>
          <Box>
            <Heading as="h2" size="lg" fontWeight="500">
              新規会議
            </Heading>
            <Text fontSize="sm" color="gray.500" mt={1}>
              録音元を選択
            </Text>
          </Box>
          <IconButton aria-label="閉じる" variant="ghost" colorPalette="gray" size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </HStack>

        <Stack gap={3}>
          <Button h="auto" py={4} justifyContent="flex-start" variant="outline" colorPalette="gray" disabled={isBusy} onClick={onRecordOnPc}>
            <Circle size="38px" bg="teal.50" color="teal.600">
              <Mic size={18} />
            </Circle>
            <Box textAlign="left">
              <Text fontSize="sm">このPCで録音</Text>
              <Text fontSize="xs" color="gray.500" mt={1}>
                マイク入力
              </Text>
            </Box>
          </Button>

          <Button h="auto" py={4} justifyContent="flex-start" variant="outline" colorPalette="gray" disabled={isBusy} onClick={onRecordGoogleMeet}>
            <Circle size="38px" bg="blue.50" color="blue.600">
              <CalendarDays size={18} />
            </Circle>
            <Box textAlign="left">
              <Text fontSize="sm">Google Meetで録音</Text>
              <Text fontSize="xs" color="gray.500" mt={1}>
                タブ音声
              </Text>
            </Box>
          </Button>
        </Stack>

        {recorderError ? (
          <Box mt={4} p={3} borderRadius="md" bg="red.50" border="1px solid" borderColor="red.100">
            <Text fontSize="sm" color="red.700" lineHeight="1.6">
              {recorderError}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Flex>
  );
}

function RecordTab({
  activeMeeting,
  recordingStatus,
  uploadStatus,
  uploadError,
  selectedFileName,
  apiBaseUrl,
  transcript,
  webRecorderStatus,
  webRecorderSource,
  webRecorderError,
  onStopWebRecording,
  onMeetingChange,
  onToggleRecording
}: {
  activeMeeting: Meeting;
  recordingStatus: RecordingStatus;
  uploadStatus: UploadStatus;
  uploadError: string;
  selectedFileName: string;
  apiBaseUrl: string;
  transcript: ApiSegment[];
  webRecorderStatus: WebRecorderStatus;
  webRecorderSource: RecorderSource | null;
  webRecorderError: string;
  onStopWebRecording: () => void;
  onMeetingChange: (id: string) => void;
  onToggleRecording: () => void;
}) {
  const isRecording = recordingStatus === "recording";
  const isStopped = recordingStatus === "stopped";
  const isWebRecording = webRecorderStatus === "recording";
  const isWebStopping = webRecorderStatus === "stopping";
  const visibleTranscript =
    transcript.length > 0
      ? transcript.map((segment) => ({
          speaker: segment.speaker || "unknown",
          time: formatTimestamp(segment.start),
          text: segment.text
        }))
      : transcriptLines;
  const statusText =
    recordingStatus === "recording"
      ? "録音と文字起こしを実行中"
      : recordingStatus === "paused"
        ? "録音を一時停止中"
        : "録音は停止済み";

  return (
    <Stack gap={5}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <MetricCard
          label="録音状態"
          value={recorderStatusLabel(webRecorderStatus)}
          detail={webRecorderSource ? recorderSourceLabel(webRecorderSource) : activeMeeting.length}
        />
        <MetricCard
          label="文字起こし"
          value={transcript.length > 0 ? `${transcript.length}件` : "待機"}
          detail={selectedFileName || "音声未選択"}
        />
        <MetricCard label="API処理" value={uploadStatusLabel(uploadStatus)} detail={uploadStatusDetail(uploadStatus)} />
      </SimpleGrid>

      <Panel>
        <Flex align={{ base: "flex-start", md: "center" }} justify="space-between" gap={4} direction={{ base: "column", md: "row" }}>
          <Box minW={0}>
            <HStack mb={2} wrap="wrap">
              <Circle size="28px" bg="teal.50" color="teal.600">
                <Upload size={15} />
              </Circle>
              <Badge colorPalette={uploadStatusColor(uploadStatus)} variant="subtle">
                {uploadStatusLabel(uploadStatus)}
              </Badge>
            </HStack>
            <Heading as="h2" size="lg" fontWeight="500">
              音声取り込み
            </Heading>
          </Box>

          {isWebRecording || isWebStopping ? (
            <Button colorPalette="pink" variant="subtle" disabled={isWebStopping} onClick={onStopWebRecording}>
              <Square size={15} />
              {isWebStopping ? "停止中" : "録音停止"}
            </Button>
          ) : null}
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 4 }} gap={3} mt={4}>
          <InfoRow label="API" text={apiBaseUrl} />
          <InfoRow label="録音元" text={recorderSourceLabel(webRecorderSource)} />
          <InfoRow label="ファイル" text={selectedFileName || recorderStatusLabel(webRecorderStatus)} />
          <InfoRow label="結果" text={transcript.length > 0 ? `${transcript.length}セグメント` : uploadStatusDetail(uploadStatus)} />
        </SimpleGrid>

        {uploadError || webRecorderError ? (
          <Box mt={4} p={3} borderRadius="md" bg="red.50" border="1px solid" borderColor="red.100">
            <Text fontSize="sm" color="red.700" lineHeight="1.6">
              {uploadError || webRecorderError}
            </Text>
          </Box>
        ) : null}
      </Panel>

      <Panel>
        <Flex align={{ base: "flex-start", md: "center" }} justify="space-between" gap={4} direction={{ base: "column", md: "row" }}>
          <Box>
            <HStack mb={2}>
              <StatusDot active={isRecording} />
              <Text color="gray.600" fontSize="sm">
                {statusText}
              </Text>
            </HStack>
            <Heading as="h2" size="lg" fontWeight="500">
              ライブ議事録
            </Heading>
          </Box>

          <HStack>
            <Button variant="outline" colorPalette="gray">
              <CalendarDays size={16} />
              予定を確認
            </Button>
            <Button colorPalette={isRecording ? "pink" : "teal"} onClick={onToggleRecording} disabled={isStopped}>
              {isRecording ? <Pause size={16} /> : <Play size={16} />}
              {isStopped ? "停止済み" : isRecording ? "一時停止" : "再開"}
            </Button>
          </HStack>
        </Flex>

        <Box mt={5} p={4} borderRadius="md" bg="#f2fbfb" border="1px solid" borderColor="teal.100">
          <Waveform active={isRecording} />
        </Box>

        <SimpleGrid columns={{ base: 1, xl: 2 }} gap={5} mt={5}>
          <Box>
            <Text fontSize="sm" color="gray.500" mb={3}>
              会議選択
            </Text>
            <Stack gap={2}>
              {meetings.map((meeting) => (
                <Button
                  key={meeting.id}
                  variant={meeting.id === activeMeeting.id ? "subtle" : "outline"}
                  colorPalette={meeting.id === activeMeeting.id ? "teal" : "gray"}
                  justifyContent="space-between"
                  h="auto"
                  py={3}
                  fontWeight="400"
                  onClick={() => onMeetingChange(meeting.id)}
                >
                  <Box textAlign="left">
                    <Text fontSize="sm">{meeting.title}</Text>
                    <Text fontSize="xs" color="gray.500">
                      {meeting.time} / {meeting.participants}
                    </Text>
                  </Box>
                  <ChevronRight size={16} />
                </Button>
              ))}
            </Stack>
          </Box>

          <Box>
            <Text fontSize="sm" color="gray.500" mb={3}>
              リアルタイム文字起こし
            </Text>
            <Stack gap={3}>
              {visibleTranscript.map((line, index) => (
                <HStack key={`${line.time}-${line.speaker}-${index}`} align="flex-start" gap={3}>
                  <Circle size="34px" bg="white" border="1px solid" borderColor="gray.200" color="gray.600" fontSize="xs">
                    {line.speaker.slice(0, 1)}
                  </Circle>
                  <Box flex="1" p={3} borderRadius="md" bg="white" border="1px solid" borderColor="gray.100">
                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color="gray.600">
                        {line.speaker}
                      </Text>
                      <Text fontSize="xs" color="gray.400">
                        {line.time}
                      </Text>
                    </HStack>
                    <Text fontSize="sm" lineHeight="1.7" color="gray.700">
                      {line.text || `セグメント ${index + 1}`}
                    </Text>
                  </Box>
                </HStack>
              ))}
            </Stack>
          </Box>
        </SimpleGrid>
      </Panel>
    </Stack>
  );
}

function MinutesTab({
  minutes,
  onChange,
  template,
  onTemplateChange
}: {
  minutes: string;
  onChange: (value: string) => void;
  template: string;
  onTemplateChange: (value: string) => void;
}) {
  return (
    <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 280px" }} gap={5}>
      <Panel>
        <HStack justify="space-between" align="flex-start" mb={4}>
          <Box>
            <Heading as="h2" size="lg" fontWeight="500">
              議事録エディタ
            </Heading>
            <Text fontSize="sm" color="gray.500" mt={1}>
              AI生成後に人が確認して共有する前提の編集画面です。
            </Text>
          </Box>
          <HStack>
            <Button variant="outline" colorPalette="gray" size="sm">
              <Download size={15} />
              書き出し
            </Button>
            <Button colorPalette="teal" size="sm">
              <Share2 size={15} />
              共有
            </Button>
          </HStack>
        </HStack>

        <Textarea
          value={minutes}
          onChange={(event) => onChange(event.target.value)}
          minH="430px"
          bg="white"
          borderColor="gray.200"
          borderRadius="md"
          fontSize="sm"
          lineHeight="1.8"
          resize="vertical"
        />
      </Panel>

      <Panel>
        <Heading as="h3" size="md" fontWeight="500" mb={4}>
          生成設定
        </Heading>
        <Stack gap={3}>
          {templateOptions.map((option) => (
            <Button
              key={option}
              variant={template === option ? "subtle" : "outline"}
              colorPalette={template === option ? "teal" : "gray"}
              justifyContent="flex-start"
              fontWeight="400"
              onClick={() => onTemplateChange(option)}
            >
              <Wand2 size={16} />
              {option}
            </Button>
          ))}
        </Stack>

        <Separator my={5} />

        <Stack gap={4}>
          <ChecklistLine text="固有名詞の表記ゆれを確認" />
          <ChecklistLine text="未確定事項にラベル付け" />
          <ChecklistLine text="社外共有前に非公開情報を確認" />
        </Stack>
      </Panel>
    </Grid>
  );
}

function SummaryTab({ summary }: { summary: MinutesResponse | null }) {
  const decisionTexts = cleanStrings(summary?.decisions?.map((item) => evidenceItemText(item, "text")) ?? []);
  const topicTexts = cleanStrings([...(summary?.topics ?? []), ...(summary?.open_questions ?? [])]);
  const unclearTexts = cleanStrings(summary?.unclear ?? []);
  const displayedDecisions = decisionTexts.length > 0 ? decisionTexts : decisions;
  const displayedTopics =
    topicTexts.length > 0 || unclearTexts.length > 0
      ? [
          ...topicTexts.map((text) => ({ label: "論点", text })),
          ...unclearTexts.map((text) => ({ label: "要確認", text }))
        ]
      : [
          { label: "未確定", text: "β版の招待基準を営業チームと合わせる" },
          { label: "確認", text: "録音Botの権限説明文を法務確認に出す" },
          { label: "保留", text: "有料プランの公開日は次回会議で決める" }
        ];
  const overview =
    summary?.overview?.trim() ||
    "β版公開に向けて、対象ユーザー、価格ページ、オンボーディング導線を整理しました。価格訴求は機能説明よりも導入事例を優先し、録音Botの参加許可は初回体験の早い段階で案内します。";
  const shareText = summary ? buildShareText(summary, displayedDecisions) : "本日のプロダクト定例では、β版の段階公開、価格ページの訴求変更、録音Botのオンボーディング改善を決定しました。担当タスクはMimemo内のタスク一覧に反映済みです。";
  const openQuestionCount = (summary?.open_questions?.length ?? 2) + (summary?.unclear?.length ?? 0);
  const todoCount = summary?.todos?.length ?? initialTasks.length;

  return (
    <Stack gap={5}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <MetricCard label="決定事項" value={`${displayedDecisions.length}件`} detail={`タスク ${todoCount}件`} />
        <MetricCard label="未解決論点" value={`${openQuestionCount}件`} detail={`チャンク ${summary?.chunk_count ?? 0}`} />
        <MetricCard label="文字起こし" value={`${summary?.transcript?.length ?? 0}件`} detail={summary ? "API生成済み" : "サンプル表示"} />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={5}>
        <Panel>
          <Heading as="h2" size="lg" fontWeight="500" mb={4}>
            要約
          </Heading>
          <Text fontSize="sm" lineHeight="1.9" color="gray.700">
            {overview}
          </Text>
        </Panel>

        <Panel>
          <Heading as="h2" size="lg" fontWeight="500" mb={4}>
            決定事項
          </Heading>
          <Stack gap={3}>
            {displayedDecisions.map((decision, index) => (
              <HStack key={decision} align="flex-start" gap={3}>
                <Circle size="28px" bg="teal.50" color="teal.600" fontSize="sm">
                  {index + 1}
                </Circle>
                <Text fontSize="sm" color="gray.700" lineHeight="1.7">
                  {decision}
                </Text>
              </HStack>
            ))}
          </Stack>
        </Panel>

        <Panel>
          <Heading as="h2" size="lg" fontWeight="500" mb={4}>
            論点
          </Heading>
          <Stack gap={3}>
            {displayedTopics.map((topic, index) => (
              <InfoRow key={`${topic.label}-${index}`} label={topic.label} text={topic.text} />
            ))}
          </Stack>
        </Panel>

        <Panel>
          <Heading as="h2" size="lg" fontWeight="500" mb={4}>
            共有文
          </Heading>
          <Box p={4} borderRadius="md" bg="gray.50" border="1px solid" borderColor="gray.200">
            <Text fontSize="sm" color="gray.700" lineHeight="1.8">
              {shareText}
            </Text>
          </Box>
        </Panel>
      </SimpleGrid>
    </Stack>
  );
}

function TasksTab({
  tasks,
  filter,
  onFilterChange,
  onToggleTask
}: {
  tasks: TaskItem[];
  filter: "all" | "open" | "done";
  onFilterChange: (filter: "all" | "open" | "done") => void;
  onToggleTask: (id: number) => void;
}) {
  return (
    <Panel>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap={3} mb={5}>
        <Box>
          <Heading as="h2" size="lg" fontWeight="500">
            抽出タスク
          </Heading>
          <Text fontSize="sm" color="gray.500" mt={1}>
            議事録から担当者と期限を抜き出して管理します。
          </Text>
        </Box>

        <HStack>
          {[
            ["all", "すべて"],
            ["open", "未完了"],
            ["done", "完了"]
          ].map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "solid" : "outline"}
              colorPalette={filter === value ? "teal" : "gray"}
              onClick={() => onFilterChange(value as "all" | "open" | "done")}
            >
              {label}
            </Button>
          ))}
        </HStack>
      </Flex>

      <Stack gap={3}>
        {tasks.map((task) => (
          <Flex
            key={task.id}
            align={{ base: "flex-start", md: "center" }}
            justify="space-between"
            gap={4}
            p={4}
            border="1px solid"
            borderColor={task.done ? "gray.200" : "teal.100"}
            bg={task.done ? "gray.50" : "white"}
            borderRadius="md"
          >
            <HStack align="flex-start" gap={3}>
              <IconButton
                aria-label={task.done ? "未完了に戻す" : "完了にする"}
                size="sm"
                variant={task.done ? "solid" : "outline"}
                colorPalette={task.done ? "teal" : "gray"}
                onClick={() => onToggleTask(task.id)}
              >
                <Check size={16} />
              </IconButton>
              <Box>
                <HStack mb={1} wrap="wrap">
                  <Text fontSize="sm" color={task.done ? "gray.500" : "gray.800"} textDecoration={task.done ? "line-through" : "none"}>
                    {task.title}
                  </Text>
                  <Badge colorPalette={task.priority === "高" ? "pink" : "gray"} variant="subtle">
                    {task.priority}
                  </Badge>
                </HStack>
                <Text fontSize="xs" color="gray.500">
                  {task.source}
                </Text>
              </Box>
            </HStack>

            <HStack minW={{ base: "auto", md: "220px" }} justify="flex-end" color="gray.600">
              <Users size={15} />
              <Text fontSize="sm">{task.owner}</Text>
              <Clock3 size={15} />
              <Text fontSize="sm">{task.due}</Text>
            </HStack>
          </Flex>
        ))}
      </Stack>
    </Panel>
  );
}

function LibraryTab({
  query,
  onQueryChange,
  meetings
}: {
  query: string;
  onQueryChange: (query: string) => void;
  meetings: typeof savedMeetings;
}) {
  return (
    <Panel>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} mb={5}>
        <Box>
          <Heading as="h2" size="lg" fontWeight="500">
            会議ライブラリ
          </Heading>
          <Text fontSize="sm" color="gray.500" mt={1}>
            保存済みの議事録、決定事項、添付ファイルを検索します。
          </Text>
        </Box>
        <Box position="relative" w={{ base: "100%", md: "320px" }}>
          <Box position="absolute" left="12px" top="50%" transform="translateY(-50%)" color="gray.400">
            <Search size={16} />
          </Box>
          <Input pl="38px" placeholder="会議名・部署・キーワード" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </Box>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        {meetings.map((meeting) => (
          <Box key={meeting.title} p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="white">
            <HStack justify="space-between" align="flex-start">
              <Circle size="40px" bg="teal.50" color="teal.600">
                <BookOpen size={18} />
              </Circle>
              <Badge variant="subtle" colorPalette={meeting.meta.includes("非公開") || meeting.meta.includes("制限") ? "pink" : "gray"}>
                {meeting.owner}
              </Badge>
            </HStack>
            <Heading as="h3" size="md" fontWeight="500" mt={4}>
              {meeting.title}
            </Heading>
            <Text fontSize="sm" color="gray.500" mt={2}>
              {meeting.meta}
            </Text>
            <HStack justify="space-between" mt={4}>
              <Text fontSize="xs" color="gray.400">
                保存: {meeting.saved}
              </Text>
              <Button size="sm" variant="ghost" colorPalette="teal">
                開く
                <ChevronRight size={15} />
              </Button>
            </HStack>
          </Box>
        ))}
      </SimpleGrid>
    </Panel>
  );
}

function SettingsTab({ template, onTemplateChange }: { template: string; onTemplateChange: (value: string) => void }) {
  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} gap={5}>
      <Panel>
        <Heading as="h2" size="lg" fontWeight="500" mb={4}>
          連携
        </Heading>
        <Stack gap={3}>
          <SettingRow title="Google Calendar" detail="予定から会議を自動作成" enabled />
          <SettingRow title="Zoom" detail="会議開始時に録音Botを参加" enabled />
          <SettingRow title="Slack" detail="要約とタスクをチャンネルに共有" enabled={false} />
          <SettingRow title="Notion" detail="確定済み議事録をDBに保存" enabled={false} />
        </Stack>
      </Panel>

      <Panel>
        <Heading as="h2" size="lg" fontWeight="500" mb={4}>
          議事録テンプレート
        </Heading>
        <Stack gap={3}>
          {templateOptions.map((option) => (
            <Button
              key={option}
              variant={template === option ? "subtle" : "outline"}
              colorPalette={template === option ? "teal" : "gray"}
              justifyContent="flex-start"
              fontWeight="400"
              onClick={() => onTemplateChange(option)}
            >
              <ClipboardList size={16} />
              {option}
            </Button>
          ))}
        </Stack>
      </Panel>

      <Panel>
        <Heading as="h2" size="lg" fontWeight="500" mb={4}>
          公開範囲
        </Heading>
        <Stack gap={3}>
          <SettingRow title="社外共有前チェック" detail="メール・金額・個人名を共有前に検出" enabled />
          <SettingRow title="部署ごとの閲覧制限" detail="HRや経営会議を自動で制限" enabled />
          <SettingRow title="録音データの自動削除" detail="30日後に音声だけ削除" enabled={false} />
        </Stack>
      </Panel>

      <Panel>
        <Heading as="h2" size="lg" fontWeight="500" mb={4}>
          AI抽出ルール
        </Heading>
        <Stack gap={3}>
          <InfoRow label="タスク" text="担当者、期限、動詞がそろう文を優先" />
          <InfoRow label="決定事項" text="合意、決定、承認に近い表現を抽出" />
          <InfoRow label="リスク" text="未確定、保留、確認中の発言を残す" />
        </Stack>
      </Panel>
    </SimpleGrid>
  );
}

function RightRail({
  activeMeeting,
  recordingStatus,
  tasks,
  onToggleRecording,
  onStopRecording
}: {
  activeMeeting: Meeting;
  recordingStatus: RecordingStatus;
  tasks: TaskItem[];
  onToggleRecording: () => void;
  onStopRecording: () => void;
}) {
  const openTasks = tasks.filter((task) => !task.done).length;
  const isRecording = recordingStatus === "recording";
  const isStopped = recordingStatus === "stopped";
  const statusText =
    recordingStatus === "recording" ? "録音中" : recordingStatus === "paused" ? "一時停止中" : "停止済み";

  return (
    <Stack gap={5} display={{ base: "none", xl: "flex" }}>
      <Panel>
        <Heading as="h2" size="md" fontWeight="500" mb={4}>
          現在の会議
        </Heading>
        <Stack gap={3}>
          <InfoRow label="時刻" text={activeMeeting.time} />
          <InfoRow label="参加者" text={activeMeeting.participants} />
          <InfoRow label="状態" text={statusText} />
        </Stack>
        <HStack mt={4} gap={2}>
          <Button
            flex="1"
            size="sm"
            variant="outline"
            colorPalette={isRecording ? "pink" : "teal"}
            disabled={isStopped}
            onClick={onToggleRecording}
          >
            {isRecording ? <Pause size={15} /> : <Play size={15} />}
            {isRecording ? "一時停止" : "再開"}
          </Button>
          <Button flex="1" size="sm" colorPalette="red" variant="subtle" disabled={isStopped} onClick={onStopRecording}>
            <Square size={14} />
            録音停止
          </Button>
        </HStack>
      </Panel>

      <Panel>
        <Heading as="h2" size="md" fontWeight="500" mb={4}>
          次に確認すること
        </Heading>
        <Stack gap={3}>
          <ChecklistLine text={`${openTasks}件の未完了タスク`} />
          <ChecklistLine text="社外共有前の伏せ字チェック" />
          <ChecklistLine text="次回会議の論点をカレンダーへ追加" />
        </Stack>
      </Panel>

      <Panel>
        <HStack justify="space-between" mb={3}>
          <Heading as="h2" size="md" fontWeight="500">
            品質スコア
          </Heading>
          <Gauge size={18} />
        </HStack>
        <Flex align="center" gap={4}>
          <Circle size="72px" bg="conic-gradient(#58c9b9 0 82%, #e6edf3 82% 100%)">
            <Circle size="52px" bg="white">
              <Text fontSize="sm">82%</Text>
            </Circle>
          </Circle>
          <Text fontSize="sm" color="gray.600" lineHeight="1.7">
            発話者の分離と決定事項の抽出は良好。未確定事項の分類を確認してください。
          </Text>
        </Flex>
      </Panel>
    </Stack>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" p={{ base: 4, md: 5 }} boxShadow="0 12px 28px rgba(15, 23, 42, 0.04)">
      {children}
    </Box>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel>
      <Text fontSize="sm" color="gray.500">
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="500" mt={2}>
        {value}
      </Text>
      <Text fontSize="xs" color="gray.500" mt={1}>
        {detail}
      </Text>
    </Panel>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <Box w="9px" h="9px" borderRadius="full" bg={active ? "pink.400" : "gray.400"} boxShadow={active ? "0 0 0 6px rgba(244, 114, 182, 0.12)" : "none"} />;
}

function Waveform({ active }: { active: boolean }) {
  const bars = [18, 34, 24, 42, 28, 52, 32, 22, 46, 30, 58, 26, 38, 20, 44, 32, 50, 24, 40, 29, 35];

  return (
    <HStack h="86px" align="center" gap={2}>
      {bars.map((height, index) => (
        <Box
          key={`${height}-${index}`}
          w="7px"
          h={`${active ? height : Math.max(12, height * 0.45)}px`}
          borderRadius="full"
          bg={index % 3 === 0 ? "teal.300" : "blue.300"}
          transition="height 160ms ease"
        />
      ))}
    </HStack>
  );
}

function ChecklistLine({ text }: { text: string }) {
  return (
    <HStack gap={3} align="flex-start">
      <Circle size="24px" bg="teal.50" color="teal.600" flexShrink={0}>
        <CheckCircle2 size={14} />
      </Circle>
      <Text fontSize="sm" color="gray.700" lineHeight="1.6">
        {text}
      </Text>
    </HStack>
  );
}

function InfoRow({ label, text }: { label: string; text: string }) {
  return (
    <Box p={3} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.100">
      <Text fontSize="xs" color="gray.500" mb={1}>
        {label}
      </Text>
      <Text fontSize="sm" color="gray.700" lineHeight="1.6">
        {text}
      </Text>
    </Box>
  );
}

function SettingRow({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
  return (
    <Flex justify="space-between" gap={4} align="center" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.100">
      <HStack gap={3}>
        <Circle size="34px" bg={enabled ? "teal.50" : "gray.100"} color={enabled ? "teal.600" : "gray.500"}>
          {enabled ? <Check size={16} /> : <Lock size={16} />}
        </Circle>
        <Box>
          <Text fontSize="sm" color="gray.800">
            {title}
          </Text>
          <Text fontSize="xs" color="gray.500" mt={1}>
            {detail}
          </Text>
        </Box>
      </HStack>
      <Badge colorPalette={enabled ? "teal" : "gray"} variant="subtle">
        {enabled ? "ON" : "OFF"}
      </Badge>
    </Flex>
  );
}
