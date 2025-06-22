// Configuration for Elasticsearch client
export interface ElasticsearchConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  caCert?: string;
  pathPrefix?: string;
  version?: string;
  sslSkipVerify?: boolean;
}

// Index information
export interface IndexInfo {
  index: string;
  health: string;
  status: string;
  docsCount: number;
  storeSize: string;
  primaryShards: number;
  replicaShards: number;
}

// Shard information
export interface ShardInfo {
  index: string;
  shard: string;
  prirep: string;
  state: string;
  docs: string;
  store: string;
  ip: string;
  node: string;
}

// Cluster health information
export interface ClusterHealth {
  status: string;
  nodeCount: number;
  datanodeCount: number;
  activePrimaryShards: number;
  activeShards: number;
  relocatingShards: number;
  initializingShards: number;
  unassignedShards: number;
  pendingTasks: number;
}

// Search aggregation result
export interface AggregationResult {
  name: string;
  buckets: Array<{
    key: string | number;
    docCount: number;
  }>;
}

// Template for schema definitions
export interface SchemaField {
  name: string;
  type: string;
  properties?: SchemaField[];
  format?: string;
  analyzer?: string;
  isRequired?: boolean;
}

// Index template information
export interface IndexTemplate {
  name: string;
  indexPatterns: string[];
  settings: Record<string, any>;
  mappings: Record<string, any>;
}

// Alias information
export interface AliasInfo {
  alias: string;
  indices: string[];
  isWriteIndex?: boolean;
}

// Pipeline information
export interface PipelineInfo {
  id: string;
  description: string;
  processors: any[];
}
