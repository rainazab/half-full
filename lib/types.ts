export interface StoryMedia { url: string; sourceUrl: string; publisher: string; type: "image"; alt: string; attribution: string; rights: "unknown" | "licensed"; licenseUrl?: string; retrievedAt: string; }
export interface SocialPost { id: string; title: string; text: string; url: string; publishedAt: string; platform: "Reddit"; community: string | null; questions: string[]; }
export interface CandidateStory {
  media?: StoryMedia[];
  id: string;
  title: string;
  url: string;
  source: string;
  description: string;
  text: string;
  publishedAt: string | null;
}

export interface Source {
  id?: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
}

export interface EvidenceRecord {
  sourceId: string;
  passageId: string;
  url: string;
  publisher: string;
  excerpt: string;
}

export interface ContentSupport {
  field: "centralClaim" | "headline" | "summary" | "whyItMatters" | "action";
  text: string;
  evidence: EvidenceRecord[];
}

export interface SourceAssessment {
  sourceId: string;
  kind: "primary" | "reporting" | "unknown";
  independenceGroup: string;
  explanation: string;
}

export interface Narration {
  script: string;
  evidence: EvidenceRecord[];
  estimatedSeconds: number;
  origin: "claude" | "reviewed-copy";
  audioUrl?: string;
  durationSeconds?: number;
  provider?: "Cartesia";
}

export interface GroundedText { text: string; evidence: EvidenceRecord[]; }
export interface StoryExperience { quick: GroundedText; explanation: GroundedText; background: GroundedText; glossary: (GroundedText & { term: string })[]; }

export interface ApprovedStory {
  media?: StoryMedia[];
  socialContext?: { posts: SocialPost[]; notice: string };
  experience?: StoryExperience;
  narration?: Narration;
  id: string;
  headline: string;
  centralClaim: string;
  summary: string;
  whyItMatters: string;
  action: string;
  category: string;
  sources: Source[];
  verificationStatus: "verified";
  confidence: number;
  hypeScore: number;
  verificationReason: string;
  evidence?: EvidenceRecord[];
  contentSupport?: ContentSupport[];
  sourceAssessments?: SourceAssessment[];
  limitations?: string[];
}

export interface RejectedStory {
  title: string;
  url: string;
  reason: string;
  confidence: number;
  verificationStatus: "uncertain" | "rejected";
  centralClaim?: string;
  reasonCode?: string;
}

export interface RunLogEntry {
  step: string;
  status: "started" | "completed" | "failed";
  message: string;
  timestamp: string;
}

export interface EditionResult {
  edition: {
    id: string;
    createdAt: string;
    stories: ApprovedStory[];
    mode?: "live" | "demo";
    demoInfo?: { label: string; recordedAt: string; originRunId: string; notice: string };
  };
  rejectedStories: RejectedStory[];
  stats: { candidatesFound: number; approved: number; rejected: number };
  runLog: RunLogEntry[];
}

export interface RunRecord {
  id: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  runLog: RunLogEntry[];
  apify?: { runId: string; datasetId: string };
  result?: EditionResult;
  error?: { code: string; message: string };
  rejectedStories?: RejectedStory[];
  stats?: EditionResult["stats"];
}
