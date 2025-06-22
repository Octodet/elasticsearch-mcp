// Type definitions for octodet-elasticsearch-mcp
import {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

export interface RequestHandlerExtra<
  T = ServerRequest,
  U = ServerNotification
> {
  request: T;
  notification?: U;
}

export interface SearchResult {
  hits: {
    total: number | { value: number; relation: string };
    hits: Array<{
      _id: string;
      _score: number;
      _source?: Record<string, any>;
      highlight?: Record<string, string[]>;
    }>;
  };
  aggregations?: Record<string, any>;
}

export interface UpdateByQueryResult {
  took: number;
  total: number;
  updated: number;
  deleted?: number;
  failures?: Array<{
    id?: string;
    cause?: {
      type?: string;
      reason?: string;
    };
  }>;
  version_conflicts?: number;
  task?: string;
}

export interface BulkOperationResult {
  took: number;
  errors: boolean;
  items: Array<Record<string, any>>;
}

// MCP compliant content types
export interface TextContent {
  type: "text";
  text: string;
  [key: string]: unknown; // This is for the index signature requirement
}

export type ContentFragment = TextContent;

export interface ResponseContent {
  content: ContentFragment[];
  [key: string]: unknown; // This is for the index signature requirement
}
