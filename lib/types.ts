export interface CandidateStory {
  id: string;
  title: string;
  url: string;
  source: string;
  description: string;
  text: string;
  publishedAt: string | null;
}

export interface Source {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
}

export interface ApprovedStory {
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
}

export interface RejectedStory {
  title: string;
  url: string;
  reason: string;
  confidence: number;
  verificationStatus: "uncertain" | "rejected";
  centralClaim?: string;
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
